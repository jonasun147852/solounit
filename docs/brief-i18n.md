# Brief — i18n: match the user's system language

> For a coding agent in the `~/oneco` repo. Commit to main when green; do not push (operator reviews). Read tools/oneco/src/ first. Packaging/UI only — no mirror-logic changes.

## Behavior

- Locale detection order: `--lang <en|zh>` flag → `ONECO_LANG` env → `LC_ALL`/`LC_MESSAGES`/`LANG` env (any value starting with `zh` → zh) → default `en`.
- Scope: every user-facing string in CLI terminal output (doctor/wallet/audit/graft/sync/dashboard/help), the dashboard HTML, and the wallet share-card HTML.
- Advisory CONTENT (summary/evidence/fix_steps from the database) stays in its source language — it is data, not chrome. Only the surrounding UI localizes.
- English output must contain zero Chinese characters; Chinese output localizes all chrome (mirror names like 修理镜/钱包镜/安全镜/认知镜 as the primary label with the English name as secondary, e.g. "修理镜 · Doctor").

## Implementation

- One module `src/i18n.mjs`: `resolveLocale(argv, env)` + a flat strings table `{ en: {...}, zh: {...} }` + `t(key, params)` with `{param}` interpolation. No dependencies.
- Every existing hardcoded label/sentence moves into the table. Grep for Chinese characters and for sentence-case English strings in src/ to find them all.
- Dashboard + share card: `lang` attribute on the HTML root, localized headings/labels/badges, number formatting stays as-is (USD).
- Help text (`oneco` with no args) localized.
- Plugin command .md files and hook triage message: leave English (they run inside Claude sessions where Claude adapts language) — out of scope.

## Tests + acceptance

- Tests for locale resolution (flag > env > LANG > default; zh_CN.UTF-8 → zh; en_US → en).
- Snapshot-style assertions: doctor/wallet/graft output under en contains no CJK characters; under zh contains the localized mirror names; dashboard HTML `lang` attribute correct in both.
- All existing tests still green (`node --test tools/oneco/tests/`); update fixtures where labels changed.
- Bump package version to 0.2.0.
- Commit with a clear message; report done.
