import { beforeEach, describe, expect, it } from 'vitest'
import type { Site } from '../api/site'
import { THEME_CACHE_KEY, saveTheme } from './themeCache'

describe('saveTheme', () => {
  beforeEach(() => localStorage.removeItem(THEME_CACHE_KEY))

  it('keeps the colour variables and html attributes for the next first paint', () => {
    saveTheme({ palette: 'site', customColors: { background: '#112233' }, lineWidth: null, style: 'tiles', corners: 'round', font: 'standard', shadows: 'none', spacing: 'compact', tileGroups: 'framed' } as Site)
    const saved = JSON.parse(localStorage.getItem(THEME_CACHE_KEY)!)
    expect(saved.vars['--color-bg']).toBe('#112233')
    expect(saved.vars['--page-bg']).toBe('#112233')
    expect(saved.attrs).toMatchObject({ style: 'tiles', corners: 'round', shadows: 'none', spacing: 'compact' })
  })
})
