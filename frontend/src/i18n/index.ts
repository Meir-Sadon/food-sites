import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import siteHe from '@site/i18n/he.json'
import he from './he.json'

export const defaultLanguage = 'he'

type Texts = { [key: string]: unknown }

/** The shared texts with the site's overrides on top (sites/<SITE>/i18n/he.json), merged key by key. */
export function mergeTexts(base: Texts, overrides: Texts): Texts {
  const merged: Texts = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key]
    merged[key] = isObject(current) && isObject(value) ? mergeTexts(current, value) : value
  }
  return merged
}

const isObject = (value: unknown): value is Texts => typeof value === 'object' && value !== null && !Array.isArray(value)

// Keep <html lang dir> in step with the active language, so adding Arabic later needs only a new file.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
})

void i18n.use(initReactI18next).init({
  resources: { he: { translation: mergeTexts(he, siteHe) } },
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  interpolation: { escapeValue: false },
})

export default i18n
