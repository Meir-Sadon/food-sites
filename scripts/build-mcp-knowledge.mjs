#!/usr/bin/env node
// Builds backend/src/FoodSite.Api/Mcp/knowledge.json, what the Claude connector (MCP) explains from: the Hebrew text
// of every feature in docs/food-sites-feature-guide.html (no screenshots) and the admin's screens with their Hebrew
// names (frontend/src/admin/sections.ts + frontend/src/i18n/he.json), and the Hebrew text of each error code.
// Run it after changing the guide or the admin's tabs; `--check` (CI) fails when the committed file is out of date.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
const target = join(root, 'backend/src/FoodSite.Api/Mcp/knowledge.json')

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()

/** The Hebrew text of every `<span data-he="…">` inside a piece of the guide, in order. */
const hebrew = (html) => [...html.matchAll(/<span\b[^>]*\bdata-he="([^"]*)"/g)].map((m) => decode(m[1])).filter(Boolean)
const first = (html, pattern) => {
  const match = html.match(pattern)
  return match ? hebrew(match[1]).join(' ') : ''
}

const html = readFileSync(join(root, 'docs/food-sites-feature-guide.html'), 'utf8')
const features = [...html.matchAll(/<article\b[^>]*\bid="feature-(\d+)"[^>]*>([\s\S]*?)<\/article>/g)].map(([, number, body]) => {
  const eyebrow = first(body, /<div class="eyebrow">([\s\S]*?)<\/div>/)
  const roles = [...body.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(([, heading, text]) => ({
    heading: hebrew(heading).join(' '),
    text: hebrew(text).join(' '),
  }))
  return {
    number: Number(number),
    group: eyebrow.replace(/^\d+\s*\/\s*/, ''),
    title: first(body, /<h2>([\s\S]*?)<\/h2>/),
    lead: first(body, /<p class="lead">([\s\S]*?)<\/p>/),
    // The guide's notes are about its screenshots and demo data, so they are left out.
    sections: roles,
  }
})
if (features.length === 0) throw new Error('No features found in the guide')

const he = JSON.parse(readFileSync(join(root, 'frontend/src/i18n/he.json'), 'utf8'))
const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], he)
const sectionsSource = readFileSync(join(root, 'frontend/src/admin/sections.ts'), 'utf8')
const screens = []
for (const [, sectionKey, tabs] of sectionsSource.matchAll(/key: '(\w+)',\s*tabs: \[([\s\S]*?)\],\s*\}/g)) {
  for (const [, path, key, feature] of tabs.matchAll(/\{ to: '([^']+)', key: '([^']+)'(?:, feature: '(\w+)')?/g)) {
    const name = lookup(key)
    if (typeof name !== 'string') throw new Error(`Missing he.json text for ${key}`)
    screens.push({ path, name, section: lookup(`admin.nav.sections.${sectionKey}`), ...(feature ? { feature } : {}) })
  }
}
if (screens.length === 0) throw new Error('No admin screens found in sections.ts')

// Error codes the admin API answers with, and the Hebrew the admin would see for each.
const errors = Object.fromEntries(Object.entries(he.errors).filter(([, text]) => typeof text === 'string'))

const json = `${JSON.stringify({ screens, errors, features }, null, 2)}\n`
if (check) {
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // missing: reported below
  }
  if (current !== json) {
    console.error('backend/src/FoodSite.Api/Mcp/knowledge.json is out of date: run node scripts/build-mcp-knowledge.mjs')
    process.exit(1)
  }
  console.log(`knowledge.json is up to date (${features.length} features, ${screens.length} screens)`)
} else {
  writeFileSync(target, json)
  console.log(`Wrote knowledge.json (${features.length} features, ${screens.length} screens)`)
}
