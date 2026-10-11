#!/usr/bin/env node
// Guard rail for the sites/ folders (docs/MIGRATION-PLAN.md, Phase 2). Fails when:
// - a site folder is missing a required file, or its site.json is invalid (including "features" that aren't on/off values
//   and "settings" the API doesn't know);
// - a site's theme.css leaves out a variable the shared CSS uses but doesn't define;
// - a site's i18n/he.json overrides a key the shared frontend/src/i18n/he.json doesn't have;
// - a business's id, name, emoji or WhatsApp template names appear in shared code (outside the site folders).
// sites/_shared/ is not a site: it holds seed files any site can list ("../_shared/seed/<name>.json").
// Usage: node scripts/check-sites.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const sitesDir = join(root, 'sites')
const template = '_template'
const shared = '_shared'
const errors = []
const fail = (message) => errors.push(message)
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const sharedTexts = readJson(join(root, 'frontend/src/i18n/he.json'))
const logos = ['logo.svg', 'logo.jpg', 'logo.jpeg', 'logo.png', 'logo.webp']
const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/
// site.json → settings: the fields of SiteSettingsDefaults (backend/src/FoodSite.Api/Sites/SiteOptions.cs).
const settingKeys = ['contactName', 'contactPhone', 'contactAddress', 'contactEmail', 'contactOpeningHours', 'deliveryAreaText', 'deliveryFeeText', 'kashrutText', 'backgroundImageUrl', 'style']
// site.json → settings.style: one of SiteStyles.All (backend/src/FoodSite.Api/Sites/SiteStyles.cs).
const styles = ['classic', 'street']

/** Every leaf key of an i18n file, as dotted paths ("order.hero.tagline"). Arrays count as one value. */
function leafKeys(texts, prefix = '') {
  return Object.entries(texts).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value) ? leafKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}
const sharedKeys = new Set(leafKeys(sharedTexts))

// Variables the shared CSS uses (var(--x)) without defining them: the theme each site's theme.css must define.
const definedVariables = (css) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
const sharedCss = readdirSync(join(root, 'frontend/src'), { recursive: true })
  .filter((file) => file.endsWith('.css'))
  .map((file) => readFileSync(join(root, 'frontend/src', file), 'utf8'))
  .join('\n')
const sharedDefined = definedVariables(sharedCss)
const themeVariables = [...new Set([...sharedCss.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter((v) => !sharedDefined.has(v))

// Values that identify one business; none may appear in shared code.
const businessValues = []

const siteNames = readdirSync(sitesDir).filter((n) => n !== shared && statSync(join(sitesDir, n)).isDirectory()).sort()
for (const name of siteNames) {
  const dir = join(sitesDir, name)
  const where = `sites/${name}`
  for (const file of ['site.json', 'theme.css', 'i18n/he.json', 'public/favicon.svg'])
    if (!existsSync(join(dir, file))) fail(`${where}: missing ${file}`)
  const siteLogos = logos.filter((logo) => existsSync(join(dir, logo)))
  if (siteLogos.length !== 1) fail(`${where}: needs exactly one logo (${logos.join(', ')}), found ${siteLogos.length}`)
  if (existsSync(join(dir, 'theme.css'))) {
    const defined = definedVariables(readFileSync(join(dir, 'theme.css'), 'utf8'))
    for (const variable of themeVariables.filter((v) => !defined.has(v)))
      fail(`${where}/theme.css: missing ${variable}, which the shared CSS uses`)
  }
  if (!existsSync(join(dir, 'site.json'))) continue

  const site = readJson(join(dir, 'site.json'))
  if (!idPattern.test(site.id ?? '')) fail(`${where}/site.json: "id" must be lowercase letters, digits and dashes`)
  else if (name !== template && site.id !== name) fail(`${where}/site.json: "id" is "${site.id}" but the folder is "${name}"`)
  if (typeof site.emoji !== 'string' || !site.emoji) fail(`${where}/site.json: "emoji" is required`)
  const features = site.features ?? {}
  if (typeof features !== 'object' || Array.isArray(features) || Object.values(features).some((on) => typeof on !== 'boolean'))
    fail(`${where}/site.json: "features" must map feature names to true or false`)
  const settings = site.settings ?? {}
  if (typeof settings !== 'object' || Array.isArray(settings)) fail(`${where}/site.json: "settings" must be an object`)
  else
    for (const [key, value] of Object.entries(settings)) {
      if (!settingKeys.includes(key)) fail(`${where}/site.json: unknown setting "${key}" (known: ${settingKeys.join(', ')})`)
      else if (typeof value !== 'string') fail(`${where}/site.json: setting "${key}" must be text`)
      else if (key === 'style' && !styles.includes(value)) fail(`${where}/site.json: style "${value}" is not one of ${styles.join(', ')}`)
    }
  for (const seed of site.seed ?? [])
    if (!existsSync(join(dir, seed))) fail(`${where}/site.json: seed file ${seed} does not exist`)

  let texts = {}
  if (existsSync(join(dir, 'i18n/he.json'))) {
    texts = readJson(join(dir, 'i18n/he.json'))
    for (const key of leafKeys(texts))
      if (!sharedKeys.has(key)) fail(`${where}/i18n/he.json: "${key}" does not exist in frontend/src/i18n/he.json`)
    if (typeof texts.app?.name !== 'string') fail(`${where}/i18n/he.json: "app.name" is required`)
  }

  if (name === template) continue
  businessValues.push(
    ...[site.id, texts.app?.name, site.emoji, site.whatsApp?.orderConfirmationTemplate, site.whatsApp?.newOrderTemplate]
      .filter((value) => typeof value === 'string' && value.length > 0)
      .map((value) => ({ value, site: name })),
  )
}

// Shared code: everything the sites build from, and the seeds they share. Docs, deploy files (render.yaml names each service)
// and the migrations' history are not checked.
const scanned = [`sites/${shared}`, 'frontend/src', 'frontend/index.html', 'frontend/vite.config.ts', 'backend/src', 'backend/tests', 'Dockerfile', 'backend/Dockerfile', 'frontend/Dockerfile']
const skipped = new Set(['node_modules', 'bin', 'obj', 'dist', 'Migrations'])
const textFile = /\.(ts|tsx|js|mjs|json|css|html|cs|csproj|svg|md)$|Dockerfile$/

function* files(path) {
  if (!existsSync(path)) return
  if (statSync(path).isFile()) {
    if (textFile.test(path)) yield path
    return
  }
  for (const entry of readdirSync(path)) if (!skipped.has(entry)) yield* files(join(path, entry))
}

for (const file of scanned.flatMap((path) => [...files(join(root, path))])) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const lower = line.toLowerCase()
    for (const { value, site } of businessValues)
      if (lower.includes(value.toLowerCase()))
        fail(`${relative(root, file)}:${index + 1}: names site "${site}" ("${value}"); move it to sites/${site}/`)
  })
}

if (errors.length > 0) {
  console.error(`check-sites: ${errors.length} problem(s)\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}
console.log(`check-sites: ${siteNames.length} site folder(s) OK, shared code names no business.`)
