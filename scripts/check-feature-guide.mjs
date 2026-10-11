#!/usr/bin/env node
// Read-only Claude-session reminder. --check validates the artifact, not its factual freshness.
import { readFileSync } from 'node:fs'
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
  const html = readFileSync(join(root, review.guide), 'utf8')
  if (!/<html\b[^>]*lang="he"[^>]*dir="rtl"/.test(html)) throw new Error('Guide must default to Hebrew/RTL')
  for (const marker of ['data-lang="he"', 'data-lang="en"', 'data-he=', 'data-en=', 'id="search"', 'id="group"', 'setLanguage(\'he\')']) {
    if (!html.includes(marker)) throw new Error(`Missing guide marker: ${marker}`)
  }
  if (/<script\b[^>]*\bsrc=/i.test(html) || /<img\b[^>]*\bsrc="https?:/i.test(html)) throw new Error('Guide must remain standalone')
  const ids = [...html.matchAll(/<article\b[^>]*id="([^"]+)"/g)].map(m => m[1])
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Missing or duplicated feature IDs')
  for (const m of html.matchAll(/href="#(feature-[^"]+)"/g)) {
    if (!ids.includes(m[1])) throw new Error(`Broken section link: ${m[1]}`)
  }
  if (check) {
    console.log(`Feature guide structure OK: ${ids.length} sections; Hebrew/English; standalone HTML. Content review remains a separate task.`)
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
