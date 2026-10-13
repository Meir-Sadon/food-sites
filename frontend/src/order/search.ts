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

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = row
  }
  return previous[b.length]
}

function isSubsequence(token: string, text: string) {
  let at = 0
  for (const ch of text) if (ch === token[at] && ++at === token.length) return true
  return false
}

/** How well one word of the query fits a text (both normalized): 0 for no match, up to 100 for the exact text. */
function scoreToken(token: string, text: string, weight: number) {
  if (!text) return 0
  if (text === token) return 100 * weight
  const words = text.split(' ')
  if (text.startsWith(token)) return 90 * weight
  if (words.some((w) => w === token)) return 85 * weight
  if (words.some((w) => w.startsWith(token))) return 80 * weight
  if (text.includes(token)) return 65 * weight
  // A typo or a missing letter: close to the start of a word of the same length (or one more or less).
  const allowed = token.length >= 5 ? 2 : token.length >= 3 ? 1 : 0
  if (allowed > 0) {
    let best = Infinity
    for (const w of words) {
      for (const length of [token.length - 1, token.length, token.length + 1]) {
        if (length < 2 || length > w.length) continue
        best = Math.min(best, editDistance(token, w.slice(0, length)))
      }
    }
    if (best <= allowed) return (55 - best * 10) * weight
  }
  if (token.length >= 3 && isSubsequence(token, text.replace(/ /g, ''))) return 20 * weight
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
