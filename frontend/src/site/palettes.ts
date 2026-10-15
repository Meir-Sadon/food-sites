import { COLOR_KEYS, MAX_LINE_WIDTH, type ColorKey, type ColorSet, type Palette } from '../api/site'

/**
 * The ready-made palettes. Each sets the main colours of the whole client site at once (page, text, links, menu,
 * banner, dishes, lines); buttons follow the accent unless a palette or the admin says otherwise. `site` is empty:
 * the site keeps the colours of its theme.css. Keep the ids in step with FoodSite.Api `Palettes.All`.
 */
export const PALETTE_COLORS: Record<Palette, ColorSet> = {
  site: {},
  olive: {
    background: '#f4f5ec', text: '#2b3320', accent: '#5b6b2f', menu: '#eef0df', menuText: '#2b3320',
    banner: '#5b6b2f', bannerText: '#ffffff', dishBackground: '#ffffff', dishText: '#2b3320', line: '#d9dcc4',
  },
  berry: {
    background: '#fbf3f6', text: '#3b1a28', accent: '#a1124f', menu: '#ffffff', menuText: '#3b1a28',
    banner: '#a1124f', bannerText: '#ffffff', dishBackground: '#ffffff', dishText: '#3b1a28', line: '#ecd3de',
  },
  ocean: {
    background: '#f1f7fb', text: '#14283a', accent: '#0b6e99', menu: '#0b3c5d', menuText: '#ffffff',
    banner: '#0b6e99', bannerText: '#ffffff', dishBackground: '#ffffff', dishText: '#14283a', line: '#cfe0ec',
  },
  sunset: {
    background: '#fff6ee', text: '#3d2314', accent: '#c2410c', menu: '#ffffff', menuText: '#3d2314',
    banner: '#c2410c', bannerText: '#ffffff', dishBackground: '#fffaf5', dishText: '#3d2314', line: '#f1d8c4',
  },
  graphite: {
    background: '#f3f4f6', text: '#1f2328', accent: '#374151', menu: '#1f2937', menuText: '#ffffff',
    banner: '#1f2937', bannerText: '#ffffff', dishBackground: '#ffffff', dishText: '#1f2328', line: '#d1d5db',
  },
  rose: {
    background: '#fdf4f0', text: '#4a2c2a', accent: '#b4534b', menu: '#f8e4de', menuText: '#4a2c2a',
    banner: '#b4534b', bannerText: '#ffffff', dishBackground: '#ffffff', dishText: '#4a2c2a', line: '#efd5cd',
  },
}

const HEX = /^#[0-9a-f]{6}$/i

function luminance(hex: string): number {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

/** WCAG contrast ratio of two `#rrggbb` colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The smallest ratio WCAG AA asks of normal text. */
export const MIN_CONTRAST = 4.5

/** Black or white, whichever reads better on this colour. */
export function readableOn(background: string): string {
  return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background) ? '#000000' : '#ffffff'
}

/** Which text colour sits on which background colour; a missing background falls back to what the site shows by default. */
const TEXT_ON: { text: ColorKey; backgrounds: (ColorKey | `#${string}`)[] }[] = [
  { text: 'text', backgrounds: ['background'] },
  { text: 'buttonText', backgrounds: ['button', 'accent'] },
  { text: 'menuText', backgrounds: ['menu', '#ffffff'] },
  { text: 'bannerText', backgrounds: ['banner', 'accent'] },
  { text: 'dishText', backgrounds: ['dishBackground', 'categoryBackground', 'background', '#ffffff'] },
]

/** The background a text colour sits on, in the colours given; undefined when the site's own colours decide it. */
export function backgroundOf(text: ColorKey, colors: ColorSet): string | undefined {
  const entry = TEXT_ON.find((e) => e.text === text)
  for (const candidate of entry?.backgrounds ?? []) {
    const value = candidate.startsWith('#') ? candidate : colors[candidate as ColorKey]
    if (value) return value
  }
  return undefined
}

/** The element a colour is copied from (`=button` → `button`), or null when it is a plain colour. */
export function copySource(value: string | undefined): ColorKey | null {
  if (!value?.startsWith('=')) return null
  return COLOR_KEYS.find((key) => key === value.slice(1)) ?? null
}

/** True when copying `source`'s colour into `key` would make a circle (`source` copies `key`, directly or through others). */
export function wouldCycle(custom: ColorSet, key: ColorKey, source: ColorKey): boolean {
  let at: ColorKey | null = source
  for (let step = 0; at && step <= COLOR_KEYS.length; step++) {
    if (at === key) return true
    at = copySource(custom[at])
  }
  return false
}

/** The colours to show: the palette's, with the admin's own over them; a colour copied from another element follows that element. */
export function mergeColors(palette: Palette, custom: ColorSet): ColorSet {
  const merged: ColorSet = { ...PALETTE_COLORS[palette] }
  for (const key of COLOR_KEYS) {
    const value = custom[key]
    if (value && HEX.test(value)) merged[key] = value.toLowerCase()
  }
  for (const key of COLOR_KEYS) {
    if (!copySource(custom[key])) continue
    // Follow the chain of copies to a colour; a circle (or a missing colour) leaves the element to the palette.
    let source: ColorKey | null = copySource(custom[key])
    for (let step = 0; source && copySource(custom[source]) && step < COLOR_KEYS.length; step++) source = copySource(custom[source])
    const resolved = source && !copySource(custom[source]) ? merged[source] : undefined
    if (resolved) merged[key] = resolved
  }
  return merged
}

/** Text colours that cannot be read on their background (below AA) are swapped for black or white; `fixed` lists them. */
export function ensureReadable(colors: ColorSet): { colors: ColorSet; fixed: ColorKey[] } {
  const result: ColorSet = { ...colors }
  const fixed: ColorKey[] = []
  for (const { text } of TEXT_ON) {
    const color = result[text]
    const background = backgroundOf(text, result)
    if (color && background && contrastRatio(color, background) < MIN_CONTRAST) {
      result[text] = readableOn(background)
      fixed.push(text)
    }
  }
  return { colors: result, fixed }
}

/**
 * The CSS variables (index.css) for a palette, the admin's colours over it and the line thickness. Only what is set
 * appears, so a site without any keeps exactly the look of its theme.css.
 */
export function colorVariables(palette: Palette, custom: ColorSet, lineWidth: number | null): Record<string, string> {
  const { colors } = ensureReadable(mergeColors(palette, custom))
  const vars: Record<string, string> = {}
  if (colors.background) {
    vars['--color-bg'] = colors.background
    vars['--page-bg'] = colors.background
  }
  if (colors.text) {
    vars['--color-text'] = colors.text
    vars['--color-muted'] = `color-mix(in srgb, ${colors.text} 72%, ${colors.background ?? '#ffffff'})`
  }
  if (colors.accent) {
    vars['--color-accent'] = colors.accent
    vars['--color-accent-hover'] = `color-mix(in srgb, ${colors.accent} 82%, #000000)`
    vars['--color-accent-contrast'] = readableOn(colors.accent)
    // The street style's stickers and highlights follow the accent too, so every style shows the palette.
    vars['--color-gold'] = `color-mix(in srgb, ${colors.accent} 55%, #ffffff)`
    vars['--color-soft'] = `color-mix(in srgb, ${colors.accent} 9%, ${colors.background ?? '#ffffff'})`
  }
  if (colors.button) {
    vars['--btn-bg'] = colors.button
    vars['--btn-bg-hover'] = `color-mix(in srgb, ${colors.button} 82%, #000000)`
  }
  if (colors.buttonText) vars['--btn-text'] = colors.buttonText
  else if (colors.button) vars['--btn-text'] = readableOn(colors.button)
  if (colors.menu) vars['--bar-bg'] = colors.menu
  if (colors.menuText) vars['--bar-text'] = colors.menuText
  else if (colors.menu) vars['--bar-text'] = readableOn(colors.menu)
  if (colors.banner) {
    vars['--gradient-hero'] = `linear-gradient(135deg, ${colors.banner} 0%, color-mix(in srgb, ${colors.banner} 72%, #000000) 100%)`
  }
  if (colors.bannerText) vars['--banner-text'] = colors.bannerText
  else if (colors.banner) vars['--banner-text'] = readableOn(colors.banner)
  if (colors.dishBackground) {
    vars['--dish-bg'] = colors.dishBackground
    vars['--dish-pad'] = '0.5rem'
  }
  if (colors.dishText) vars['--dish-text'] = colors.dishText
  else if (colors.dishBackground) vars['--dish-text'] = readableOn(colors.dishBackground)
  if (colors.categoryBackground) vars['--category-bg'] = colors.categoryBackground
  if (colors.line) vars['--color-border'] = colors.line
  if (lineWidth && lineWidth >= 1 && lineWidth <= MAX_LINE_WIDTH) vars['--line-width'] = `${lineWidth}px`
  return vars
}
