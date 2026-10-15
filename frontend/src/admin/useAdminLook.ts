import { useEffect, useState } from 'react'
import type { Settings } from '../api/catalog'
import { siteApi, type ColorSet, type FontPair, type Palette, type Shadows } from '../api/site'
import { useApplyColors } from '../site/useApplyColors'

interface Look {
  palette: Palette
  customColors: ColorSet
  lineWidth: number | null
  font: FontPair
  shadows: Shadows
}

const EVENT = 'site-look-changed'

/** Tells the admin layout the colours or finish just saved, so the admin shows them without reloading. */
export function announceLook(settings: Settings) {
  window.dispatchEvent(new CustomEvent<Look>(EVENT, { detail: settings }))
}

/**
 * The admin wears the site's colours, line thickness, font and shadows too (the style, corners and spacing stay the
 * client site's). Loads them from `/api/site` and follows `announceLook`; without an answer the admin keeps its plain look.
 */
export function useAdminLook() {
  const [look, setLook] = useState<Look | null>(null)

  useEffect(() => {
    let active = true
    siteApi
      .get()
      .then((site) => active && setLook(site))
      .catch(() => undefined)
    const onChange = (event: Event) => setLook((event as CustomEvent<Look>).detail)
    window.addEventListener(EVENT, onChange)
    return () => {
      active = false
      window.removeEventListener(EVENT, onChange)
    }
  }, [])

  useApplyColors(look?.palette ?? 'site', look?.customColors ?? {}, look?.lineWidth ?? null)

  const font = look?.font
  const shadows = look?.shadows
  useEffect(() => {
    const root = document.documentElement
    if (font) root.dataset.font = font
    if (shadows) root.dataset.shadows = shadows
    return () => {
      delete root.dataset.font
      delete root.dataset.shadows
    }
  }, [font, shadows])
}
