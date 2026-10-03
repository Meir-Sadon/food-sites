import { afterEach, describe, expect, it } from 'vitest'
import i18n, { defaultLanguage } from '.'
import he from './he.json'

describe('i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage(defaultLanguage)
  })

  it('starts in Hebrew with a right-to-left document', () => {
    expect(i18n.language).toBe('he')
    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')
  })

  it('reads texts from the Hebrew language file', () => {
    expect(i18n.t('app.name')).toBe(he.app.name)
    expect(i18n.t('nav.order')).toBe('הזמנה')
  })

  it('updates the document direction when the language changes', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.dir).toBe('ltr')
    await i18n.changeLanguage('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })
})
