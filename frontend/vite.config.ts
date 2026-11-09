import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { sitePwa } from './vite-pwa.ts'

// In development the API is reached through this proxy, so the session cookie stays same-origin.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:5000'

// The business to build: a folder under sites/. Without SITE, dev runs and tests use the template.
const siteId = process.env.SITE || '_template'
const siteDir = fileURLToPath(new URL(`../sites/${siteId}`, import.meta.url))
if (!existsSync(`${siteDir}/site.json`)) throw new Error(`SITE=${siteId}: sites/${siteId}/site.json does not exist.`)

/**
 * The head search engines and link previews read before the app runs: <title> is the site's name and the
 * description is its tagline (`order.hero.tagline`), each from its own i18n override, else the shared text.
 * The server adds what depends on the address and the admin's settings (see backend Seo/SeoHead.cs).
 */
function siteHead(): Plugin {
  type Texts = { app?: { name?: string }; order?: { hero?: { tagline?: string } } }
  const read = (path: string): Texts => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Texts) : {})
  const own = read(`${siteDir}/i18n/he.json`)
  const shared = read(fileURLToPath(new URL('src/i18n/he.json', import.meta.url)))
  const name = own.app?.name ?? shared.app?.name ?? ''
  const tagline = own.order?.hero?.tagline ?? shared.order?.hero?.tagline ?? ''
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const meta = (attr: 'name' | 'property', key: string, content: string) => ({ tag: 'meta', attrs: { [attr]: key, content: escape(content) }, injectTo: 'head' as const })
  return {
    name: 'site-head',
    transformIndexHtml: (html) => ({
      html: html.replace(/<title>.*<\/title>/, `<title>${escape(name)}</title>`),
      tags: [
        meta('name', 'description', tagline),
        meta('property', 'og:type', 'website'),
        meta('property', 'og:locale', 'he_IL'),
        meta('property', 'og:site_name', name),
        meta('property', 'og:title', name),
        meta('property', 'og:description', tagline),
      ],
    }),
  }
}

export default defineConfig({
  plugins: [react(), siteHead(), sitePwa(siteDir, fileURLToPath(new URL('src/i18n/he.json', import.meta.url)))],
  resolve: {
    alias: { '@site': siteDir },
  },
  // favicon.svg and the pictures a seed refers to, served from the site root.
  publicDir: `${siteDir}/public`,
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), siteDir] },
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
})
