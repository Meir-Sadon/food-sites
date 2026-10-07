import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// In development the API is reached through this proxy, so the session cookie stays same-origin.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:5000'

// The business to build: a folder under sites/. Without SITE, dev runs and tests use the template.
const siteId = process.env.SITE || '_template'
const siteDir = fileURLToPath(new URL(`../sites/${siteId}`, import.meta.url))
if (!existsSync(`${siteDir}/site.json`)) throw new Error(`SITE=${siteId}: sites/${siteId}/site.json does not exist.`)

/** Sets <title> to the site's name: its own i18n override, else the shared text. */
function siteTitle(): Plugin {
  const nameIn = (path: string): string | undefined =>
    existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { app?: { name?: string } }).app?.name : undefined
  const name = nameIn(`${siteDir}/i18n/he.json`) ?? nameIn(fileURLToPath(new URL('src/i18n/he.json', import.meta.url))) ?? ''
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return {
    name: 'site-title',
    transformIndexHtml: (html) => html.replace(/<title>.*<\/title>/, `<title>${escaped}</title>`),
  }
}

export default defineConfig({
  plugins: [react(), siteTitle()],
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
