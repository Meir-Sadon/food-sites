import { describe, expect, it } from 'vitest'
import { COLOR_KEYS, PALETTES } from '../api/site'
import { MIN_CONTRAST, PALETTE_COLORS, colorVariables, contrastRatio, ensureReadable, mergeColors } from './palettes'

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same colour', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })
})

describe('palettes', () => {
  it('has a set of colours for every palette and only known elements', () => {
    expect(Object.keys(PALETTE_COLORS).sort()).toEqual([...PALETTES].sort())
    for (const colors of Object.values(PALETTE_COLORS)) {
      for (const [key, value] of Object.entries(colors)) {
        expect(COLOR_KEYS).toContain(key)
        expect(value).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('keeps every text readable on its background in every palette', () => {
    for (const palette of PALETTES) expect(ensureReadable(PALETTE_COLORS[palette]).fixed).toEqual([])
  })

  it('sets nothing for the site palette, so the theme.css look stays', () => {
    expect(colorVariables('site', {}, null)).toEqual({})
  })

  it('lets the admin colours win over the palette', () => {
    expect(mergeColors('berry', { button: '#112233' })).toMatchObject({ button: '#112233', menu: PALETTE_COLORS.berry.menu })
    expect(colorVariables('berry', { button: '#112233' }, null)['--btn-bg']).toBe('#112233')
  })

  it('swaps a text colour that cannot be read for black or white', () => {
    const { colors, fixed } = ensureReadable({ menu: '#ffffff', menuText: '#f0f0f0', button: '#000000', buttonText: '#111111' })
    expect(fixed).toEqual(['buttonText', 'menuText'])
    expect(colors.menuText).toBe('#000000')
    expect(colors.buttonText).toBe('#ffffff')
    expect(contrastRatio(colors.menuText!, '#ffffff')).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('picks readable text itself when only a background is set', () => {
    const vars = colorVariables('site', { menu: '#101820', banner: '#ffee88' }, 2)
    expect(vars['--bar-text']).toBe('#ffffff')
    expect(vars['--banner-text']).toBe('#000000')
    expect(vars['--line-width']).toBe('2px')
  })
})
