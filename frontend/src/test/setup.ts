import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '../i18n'
import { THEME_CACHE_KEY } from '../site/themeCache'

afterEach(() => {
  cleanup()
  localStorage.removeItem(THEME_CACHE_KEY)
  vi.restoreAllMocks()
})
