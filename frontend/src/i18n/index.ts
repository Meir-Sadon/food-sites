import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import he from './he.json'

export const defaultLanguage = 'he'

// Keep <html lang dir> in step with the active language, so adding Arabic later needs only a new file.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  document.documentElement.dir = i18n.dir(lng)
})

void i18n.use(initReactI18next).init({
  resources: { he: { translation: he } },
  lng: defaultLanguage,
  fallbackLng: defaultLanguage,
  interpolation: { escapeValue: false },
})

export default i18n
