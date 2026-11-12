#!/usr/bin/env node
// Read-only Claude-session reminder. --check validates the artifact, not its factual freshness.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

try {
  const review = JSON.parse(readFileSync(join(root, 'docs/feature-guide-review.json'), 'utf8'))
  if (review.guide !== 'docs/food-sites-feature-guide.html') throw new Error('Unexpected guide path')
  if (!/^[a-f0-9]{40}$/.test(review.reviewed_commit)) throw new Error('Invalid reviewed_commit')
  const reviewedAt = Date.parse(review.reviewed_at)
  if (!Number.isFinite(reviewedAt) || reviewedAt > Date.now()) throw new Error('Invalid or future reviewed_at')
  if (review.review_interval_days !== 3) throw new Error('Review interval must be 3 days')
  // The guide is an index page that only navigates, plus one file per topic in docs/feature-guide/ (shared guide.css and guide.js, screenshots in img/).
  const guideDir = join(root, 'docs/feature-guide')
  const index = readFileSync(join(root, review.guide), 'utf8')
  const chapterFiles = readdirSync(guideDir).filter(f => f.endsWith('.html')).sort()
  if (!chapterFiles.length) throw new Error('No topic files in docs/feature-guide')
  const pages = { [review.guide]: index, ...Object.fromEntries(chapterFiles.map(f => [`docs/feature-guide/${f}`, readFileSync(join(guideDir, f), 'utf8')])) }
  const script = readFileSync(join(guideDir, 'guide.js'), 'utf8')
  for (const marker of ['data-lang="he"', 'data-lang="en"']) {
    for (const [name, html] of Object.entries(pages)) if (!html.includes(marker)) throw new Error(`${name}: missing ${marker}`)
  }
  if (!script.includes("setLanguage(")) throw new Error("guide.js: missing setLanguage")
  for (const [name, html] of Object.entries(pages)) {
    if (!/<html\b[^>]*lang="he"[^>]*dir="rtl"/.test(html)) throw new Error(`${name}: must default to Hebrew/RTL`)
    if (!html.includes('data-he=') || !html.includes('data-en=')) throw new Error(`${name}: needs Hebrew and English text`)
    if (!html.includes('id="search"')) throw new Error(`${name}: missing search box`)
    if (/<script\b[^>]*\bsrc="https?:/i.test(html) || /<link\b[^>]*\bhref="https?:/i.test(html) || /<img\b[^>]*\bsrc="https?:/i.test(html)) throw new Error(`${name}: must not load anything from the network`)
    for (const m of html.matchAll(/<img\b[^>]*\bsrc="(img\/[^"]+)"/g)) {
      if (!existsSync(join(guideDir, m[1]))) throw new Error(`${name}: missing image ${m[1]}`)
    }
  }
  const ids = []
  for (const [name, html] of Object.entries(pages)) {
    for (const m of html.matchAll(/<article\b[^>]*id="([^"]+)"/g)) ids.push([m[1], name])
  }
  if (!ids.length || new Set(ids.map(i => i[0])).size !== ids.length) throw new Error('Missing or duplicated feature IDs')
  // The index links every section, so a new section cannot be forgotten there.
  for (const [id, name] of ids) {
    const file = name.split('/').pop()
    if (!index.includes(`href="feature-guide/${file}#${id}"`)) throw new Error(`The index does not link ${id} in ${file}`)
  }
  for (const m of index.matchAll(/href="feature-guide\/([a-z-]+\.html)#(feature-[^"]+)"/g)) {
    if (!ids.some(([id, name]) => id === m[2] && name.endsWith(`/${m[1]}`))) throw new Error(`Broken index link: ${m[1]}#${m[2]}`)
  }
  for (const [name, html] of Object.entries(pages)) {
    for (const m of html.matchAll(/href="#(feature-[^"]+)"/g)) {
      if (!ids.some(([id, n]) => id === m[1] && n === name)) throw new Error(`${name}: broken section link ${m[1]}`)
    }
  }
  // The production image builds the single-file guide from these files; make sure it still builds and holds every topic.
  const { buildGuide } = await import('./build-feature-guide.mjs')
  const single = buildGuide(root)
  for (const f of chapterFiles) if (!single.includes(`id="page-${f.slice(0, -5)}"`)) throw new Error(`The single-file guide misses ${f}`)
  if (/<img\b[^>]*\bsrc="img\//.test(single)) throw new Error('The single-file guide still has an image link')
  if (check) {
    console.log(`Feature guide structure OK: ${ids.length} sections in ${chapterFiles.length} topic files plus the index; Hebrew/English; no network resources. Content review remains a separate task.`)
  } else {
    const reasons = []
    if (Date.now() - reviewedAt >= review.review_interval_days * 86400000) reasons.push('at least 3 days since the last source review')
    try {
      git('cat-file', '-e', `${review.reviewed_commit}^{commit}`)
      const changed = git('diff', '--name-only', review.reviewed_commit, 'HEAD', '--', 'frontend/src', 'backend/src', 'sites')
      if (changed) reasons.push('product files changed since the reviewed commit')
    } catch {
      reasons.push('reviewed history is unavailable; fetch it or report the comparison as blocked')
    }
    if (reasons.length) console.log(`FEATURE GUIDE REVIEW REQUIRED: ${reasons.join('; ')}. Follow CLAUDE.md: review source changes, update both languages and safe screenshots where needed, and advance docs/feature-guide-review.json only after an actual review.`)
    else console.log('Feature guide: no source-change or 3-day review reminder is currently due.')
  }
} catch (error) {
  console.error(`Feature guide ${check ? 'validation failed' : 'review needed'}: ${error.message}`)
  // Missing docs must not prevent Claude from starting and repairing them.
  if (check) process.exitCode = 1
}
