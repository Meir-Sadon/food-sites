# Feature guide

[Download/open the bilingual HTML guide](food-sites-feature-guide.html). GitHub shows its source: download the raw file and open it locally in a browser. Images are embedded, so no companion folder is needed. The page opens in Hebrew/RTL and includes an English switch, search, category filters, enlarged screenshots and printing.

## Maintenance

Follow the **Feature guide maintenance** section of `../CLAUDE.md`.

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
