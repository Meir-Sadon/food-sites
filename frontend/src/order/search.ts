import type { Menu, MenuDish } from '../api/site'
import { variantsOf } from './model'

/** The fewest characters that start a search. */
export const SEARCH_MIN_LENGTH = 2

/**
 * Hebrew-aware text for comparing: lower case, no niqqud or cantillation marks, final letters as their regular
 * forms, quote and geresh marks dropped, spaces collapsed.
 */
export function normalizeSearchText(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .toLowerCase()
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .replace(/[׳״'"`´’‘“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** How well one word of the query fits a text (both normalized): 0 unless the word appears in it, up to 100 for the exact text. */
function scoreToken(token: string, text: string, weight: number) {
  if (!text) return 0
  if (text === token) return 100 * weight
  const words = text.split(' ')
  if (text.startsWith(token)) return 90 * weight
  if (words.some((w) => w === token)) return 85 * weight
  if (words.some((w) => w.startsWith(token))) return 80 * weight
  if (text.includes(token)) return 65 * weight
  return 0
}

const NAME_WEIGHT = 1
const DESCRIPTION_WEIGHT = 0.5

/** How well a dish fits the query; 0 when it does not. Every word of the query has to match the name or the description. */
export function scoreDish(query: string, dish: Pick<MenuDish, 'name' | 'description'>) {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return 0
  const name = normalizeSearchText(dish.name)
  const description = normalizeSearchText(dish.description ?? '')
  let total = 0
  for (const token of tokens) {
    const score = Math.max(scoreToken(token, name, NAME_WEIGHT), scoreToken(token, description, DESCRIPTION_WEIGHT))
    if (score === 0) return 0
    total += score
  }
  return total / tokens.length
}

/**
 * The dishes a client can order on their own (a main dish stands for its variants), from the best match to the
 * weakest. A main dish scores as its best variant; ties keep the menu's order.
 */
export function searchDishes(menu: Menu, query: string, standalone: MenuDish[]) {
  if (normalizeSearchText(query).length < SEARCH_MIN_LENGTH) return []
  return standalone
    .map((dish, index) => {
      const score = Math.max(scoreDish(query, dish), ...variantsOf(dish, menu).map((v) => scoreDish(query, v)))
      return { dish, score, index }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((hit) => hit.dish)
}

/** One character of a text as normalizeSearchText sees it: '' when it is dropped, a space for a separator. */
function normalizeChar(ch: string) {
  return normalizeSearchText(`a${ch}a`).slice(1, -1)
}

/**
 * The stretches of `text` (start, end offsets) that the words of the query matched, so they can be marked. Matching is
 * the same as the search's (niqqud, final letters and case ignored); only exact appearances count.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const tokens = normalizeSearchText(query).split(' ').filter(Boolean)
  if (!text || tokens.length === 0) return []
  let normalized = ''
  const owner: number[] = []
  const chars = Array.from(text)
  const offsets: number[] = []
  let offset = 0
  for (const ch of chars) {
    offsets.push(offset)
    offset += ch.length
    for (const n of normalizeChar(ch)) {
      if (n === ' ' && (normalized === '' || normalized.endsWith(' '))) continue
      normalized += n
      owner.push(offsets.length - 1)
    }
  }
  const marked: [number, number][] = []
  for (const token of tokens) {
    for (let at = normalized.indexOf(token); at !== -1; at = normalized.indexOf(token, at + 1)) {
      let last = owner[at + token.length - 1]
      // Marks that belong to the last letter (niqqud) stay inside the highlight.
      while (last + 1 < chars.length && normalizeChar(chars[last + 1]) === '' && /[֑-ׇ]/.test(chars[last + 1])) last++
      marked.push([offsets[owner[at]], offsets[last] + chars[last].length])
    }
  }
  marked.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const range of marked) {
    const prev = merged[merged.length - 1]
    if (prev && range[0] <= prev[1]) prev[1] = Math.max(prev[1], range[1])
    else merged.push([...range])
  }
  return merged
}
