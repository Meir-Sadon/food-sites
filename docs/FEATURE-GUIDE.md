# Feature guide

[Download/open the bilingual HTML guide](food-sites-feature-guide.html). GitHub shows its source: download the raw file and open it locally in a browser. Images are embedded, so no companion folder is needed. The page opens in Hebrew/RTL and includes an English switch, search, category filters, enlarged screenshots and printing.

## Maintenance

Follow the **Feature guide maintenance** section of `../CLAUDE.md` and the full rules at the end of this file.

1. Review customer/admin behavior changes in each feature PR, and any documentation missed after a merge.
2. At least every three days, the next Claude session reviews source changes since `feature-guide-review.json`'s `reviewed_commit`. The SessionStart hook prints a reminder when needed; it does not autonomously edit files.
3. Update both languages in the HTML (`data-he` / `data-en` plus translated attributes). Preserve Hebrew in the initial DOM and `setLanguage('he')`. Keep paired captions and evidence notes accurate.
4. Use synthetic data for screenshots. The imported public copy intentionally excludes screenshots containing contact, order or payment details. Do not silently replace those omissions with real production data.
5. Update the review marker only after actually reviewing the relevant intervening source changes. `screenshots_captured_on` records screenshot age, independently of `reviewed_at`.
6. Run `node scripts/check-feature-guide.mjs --check` and manually check both languages, filters, zoom and printing. The script checks structure and metadata, not factual completeness or image privacy.

## Automation boundary

`CLAUDE.md` provides instructions; it cannot launch Claude on a timer or GitHub event. The repo's session hook is a local/Claude-session reminder. A separately configured ChatGPT GitHub merge automation can inspect merged PRs and propose documentation updates; it is not a GitHub Actions Claude runner and does not auto-merge changes. Documentation-only merges should be skipped to prevent update loops.

## Imported baseline

The guide was inspected on 8 October 2026 against source `8200f094d9598bcd5ea0f73af502becc88a0eaea`. Importing it into the repository is not a claim that subsequent product changes have been reviewed. Missing captures and untested authenticated flows remain explicitly identified.

## Full maintenance rules (moved from CLAUDE.md)

The reusable customer/admin feature catalog is [`docs/food-sites-feature-guide.html`](docs/food-sites-feature-guide.html). It targets small food businesses: **Hebrew by default, RTL, with a complete English switch**. Keep both languages, accessible labels, search, category filters, image enlargement and print support working. Document one business's capabilities, not the multi-site wrapper.

- In every PR that adds, removes or changes customer/admin behavior, update the affected feature descriptions and screenshots in the same PR. For changes with no guide impact, state why in the PR checklist.
- After a PR merges, review the merged changes against the guide. If they were not already documented, prepare a focused documentation PR; do not automatically merge it. A merge-triggered ChatGPT automation can perform this follow-up; this file itself does not launch Claude or a background job.
- At the start of a Claude session, run `node scripts/check-feature-guide.mjs`. If the last review is at least **3 days** old, or product files have changed since the recorded commit, review those changes before finishing the session. The SessionStart hook prints the same reminder. Do not interrupt an unrelated urgent fix; explicitly record a blocked review instead of pretending it was completed.
- Read `docs/feature-guide-review.json` for the last genuinely reviewed commit/date. Compare against current source; update the marker only after reviewing all intervening relevant changes. Keep screenshot capture dates separate: a text review must not make old screenshots appear new. Fetch missing history when permitted; otherwise report that comparison is blocked.
- Capture customer and admin screens where the feature has those views. Use local/staging **synthetic data**. Never commit credentials, review tokens, real customer details, order/payment data or private contact information. Omitted captures in the imported guide must remain explicitly marked until safe replacements exist. Do not alter production settings, create production orders or send messages to obtain screenshots.
- Preserve honest evidence labels: observed, code-verified, unconfigured, sign-in required or capture unavailable. Never invent a screenshot or claim a full flow was tested when it was not. Keep source links and applicable limits accurate.
- Keep the HTML standalone (embedded images; no external scripts), validate Hebrew/English text and direction, search/filter behavior, image enlargement, source links and print output. Run `node scripts/check-feature-guide.mjs --check` before committing. Do not rewrite or recapture unchanged images solely to change the review date.

The checked-in review marker deliberately retains the original 8 October 2026 snapshot until a subsequent source review is completed. See [`docs/FEATURE-GUIDE.md`](docs/FEATURE-GUIDE.md) for opening and maintaining it.
