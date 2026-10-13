import { describe, expect, it } from 'vitest'
import { menu, menuDish } from '../test/catalogData'
import { normalizeSearchText, scoreDish, searchDishes } from './search'

const dish = (name: string, description: string | null = null) => ({ name, description })

describe('normalizeSearchText', () => {
  it('drops niqqud, folds final letters and quote marks', () => {
    expect(normalizeSearchText('כֻּסְכֻּס')).toBe('כסכס')
    expect(normalizeSearchText('חמוצים')).toBe(normalizeSearchText('חמוצים'))
    expect(normalizeSearchText('ג׳חנון')).toBe('גחנונ')
    expect(normalizeSearchText('  עוף   בתנור ')).toBe('עופ בתנור')
  })
})

describe('scoreDish', () => {
  it('ranks exact, prefix, word start, inside, then description', () => {
    const exact = scoreDish('קובה', dish('קובה'))
    const prefix = scoreDish('קוב', dish('קובה במרק'))
    const wordStart = scoreDish('מרק', dish('קובה מרק'))
    const inside = scoreDish('ובה', dish('קובה'))
    const description = scoreDish('מרק', dish('קובה', 'במרק חם'))
    expect(exact).toBeGreaterThan(prefix)
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(inside)
    expect(inside).toBeGreaterThan(description)
    expect(description).toBeGreaterThan(0)
  })

  it('matches final letters and tolerates a typo', () => {
    expect(scoreDish('חמוצים', dish('חמוצים'))).toBeGreaterThan(0)
    expect(scoreDish('קובא', dish('קובה'))).toBeGreaterThan(0)
    expect(scoreDish('פיצה', dish('קובה'))).toBe(0)
  })

  it('needs every word of the query', () => {
    expect(scoreDish('עוף בתנור', dish('עוף בתנור'))).toBeGreaterThan(0)
    expect(scoreDish('עוף קובה', dish('עוף בתנור'))).toBe(0)
  })
})

describe('searchDishes', () => {
  const m = menu({
    dishes: [
      menuDish(1, 'מרק עוף', 1),
      menuDish(2, 'עוף בתנור', 1),
      menuDish(3, 'עופרת', 1),
      menuDish(4, 'סלט', 1, { description: 'עם נתחי עוף' }),
    ],
  })
  const all = m.dishes

  it('waits for two characters', () => {
    expect(searchDishes(m, 'ע', all)).toEqual([])
  })

  it('lists the best match first', () => {
    expect(searchDishes(m, 'עוף', all).map((d) => d.id)).toEqual([2, 3, 1, 4])
  })

  it('finds a main dish by its variant', () => {
    const withVariant = menu({ dishes: [menuDish(1, 'שניצל', 1), menuDish(2, 'חזה בפירורים', 1, { mainDishId: 1 })] })
    expect(searchDishes(withVariant, 'חזה', [withVariant.dishes[0]]).map((d) => d.id)).toEqual([1])
  })
})
