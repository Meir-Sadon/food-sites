import { useEffect } from 'react'
import type { ColorSet, Palette } from '../api/site'
import { colorVariables } from './palettes'

/**
 * Sets the palette, the admin's colours and the line thickness as CSS variables on `<html>` (`colorVariables`) and
 * removes them again when the component goes away. Used by the client pages and by the admin, so both show them.
 */
export function useApplyColors(palette: Palette, customColors: ColorSet, lineWidth: number | null) {
  // The colours are objects that change identity on every load; their JSON stands for them.
  const key = JSON.stringify([palette, customColors, lineWidth])
  useEffect(() => {
    const root = document.documentElement
    const [p, colors, width] = JSON.parse(key) as Parameters<typeof colorVariables>
    const vars = colorVariables(p, colors, width)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name)
    }
  }, [key])
}
