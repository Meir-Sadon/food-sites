import { site } from '../site/config'

/** The visitor's accessibility choices; kept in this browser only (`localStorage`), never sent to the server. */
export interface A11yPrefs {
  /** 0 is the page's own size; each step makes the text larger (see `TEXT_SIZES`). */
  textSize: number
  highContrast: boolean
  grayscale: boolean
  highlightLinks: boolean
  readableFont: boolean
  stopMotion: boolean
  bigCursor: boolean
}

/** The root font size in percent for each text size step (the pages size everything in rem). */
export const TEXT_SIZES = [100, 115, 130, 150, 175] as const

export const DEFAULT_PREFS: A11yPrefs = {
  textSize: 0,
  highContrast: false,
  grayscale: false,
  highlightLinks: false,
  readableFont: false,
  stopMotion: false,
  bigCursor: false,
}

export const PREFS_KEY = `${site.id}.accessibility`

/** Fired on `window` after the choices change, for the parts of the page that cannot read them from CSS. */
export const PREFS_EVENT = 'a11y-prefs-change'

export const isDefault = (prefs: A11yPrefs) => (Object.keys(DEFAULT_PREFS) as (keyof A11yPrefs)[]).every((k) => prefs[k] === DEFAULT_PREFS[k])

export function loadPrefs(): A11yPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<A11yPrefs> | null
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS }
    const prefs = { ...DEFAULT_PREFS }
    for (const key of Object.keys(DEFAULT_PREFS) as (keyof A11yPrefs)[]) {
      if (key === 'textSize') {
        const size = raw.textSize
        if (typeof size === 'number' && Number.isInteger(size) && size >= 0 && size < TEXT_SIZES.length) prefs.textSize = size
      } else if (typeof raw[key] === 'boolean') {
        prefs[key] = raw[key]
      }
    }
    return prefs
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs: A11yPrefs) {
  try {
    if (isDefault(prefs)) localStorage.removeItem(PREFS_KEY)
    else localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage can be blocked (private window); the choices then last until the page is closed.
  }
}

/** Marks `<html>` with the choices (`styles/accessibility.css` selects on them) and sets the text size. */
export function applyPrefs(prefs: A11yPrefs) {
  const root = document.documentElement
  const flag = (name: string, on: boolean, value = 'on') => {
    if (on) root.setAttribute(name, value)
    else root.removeAttribute(name)
  }
  flag('data-a11y-contrast', prefs.highContrast, 'high')
  flag('data-a11y-grayscale', prefs.grayscale)
  flag('data-a11y-links', prefs.highlightLinks)
  flag('data-a11y-font', prefs.readableFont)
  flag('data-a11y-motion', prefs.stopMotion, 'off')
  flag('data-a11y-cursor', prefs.bigCursor, 'big')
  flag('data-a11y-size', prefs.textSize > 0)
  if (prefs.textSize > 0) root.style.fontSize = `${TEXT_SIZES[prefs.textSize]}%`
  else root.style.removeProperty('font-size')
  window.dispatchEvent(new Event(PREFS_EVENT))
}

/** Removes everything `applyPrefs` set (the admin and the driver's page keep their own look). */
export function clearApplied() {
  applyPrefs(DEFAULT_PREFS)
}
