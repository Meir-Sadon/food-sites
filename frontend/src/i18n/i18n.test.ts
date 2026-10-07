import { afterEach, describe, expect, it } from 'vitest'
import siteHe from '@site/i18n/he.json'
import i18n, { defaultLanguage, mergeTexts } from '.'
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

  it('reads texts from the Hebrew language file, with the site\'s overrides on top', () => {
    expect(i18n.t('nav.order')).toBe(he.nav.order)
    expect(i18n.t('app.name')).toBe(siteHe.app.name)
    expect(i18n.t('order.hero.fresh')).toBe(he.order.hero.fresh)
  })

  it('merges overrides key by key, keeping the shared siblings', () => {
    const merged = mergeTexts({ a: { b: '1', c: '2' }, list: ['x'], d: '3' }, { a: { b: 'one' }, list: ['y', 'z'] })
    expect(merged).toEqual({ a: { b: 'one', c: '2' }, list: ['y', 'z'], d: '3' })
  })

  it('updates the document direction when the language changes', async () => {
    await i18n.changeLanguage('en')
    expect(document.documentElement.dir).toBe('ltr')
    await i18n.changeLanguage('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })
})
