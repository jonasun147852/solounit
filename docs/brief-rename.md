# Brief — rebrand: user-facing name is SoloUnit; oneco becomes internal codename

> For a coding agent in this repo. Commit to main when green; do not push. Read README.md, tools/oneco/package.json, tools/oneco/src/i18n.mjs first.

## Decision being executed

Everything a USER sees says **SoloUnit**. Internal/backend identifiers keep `oneco` where invisible or where changing would break data.

## Rename (user-visible)

1. npm package name: `oneco-cli` → **`solounit`**. bin: `{ "solounit": "./bin/oneco.mjs" }` (file paths inside the repo may stay as-is; only the command name matters). Version stays 0.2.0.
2. README.md (root and tools/oneco/README.md): product name **SoloUnit**, install `npx solounit graft`, plugin install `claude plugin marketplace add jonasun147852/solounit` + `claude plugin install solounit@solounit`, tagline "When your agent acts up, run solounit first." Badge URLs: repo path will become `jonasun147852/solounit` (the operator renames the GitHub repo; write badges against that path).
3. `.claude-plugin/marketplace.json`: marketplace name `solounit`, plugin name `solounit`.
4. `tools/oneco-plugin/.claude-plugin/plugin.json`: name `solounit` (version bump to 0.2.0). Slash commands therefore become `/solounit:graft` etc. — update the plugin README accordingly.
5. i18n catalog: every user-facing occurrence of "oneco" as a BRAND (dashboard title, share card footer, help header, closing lines) → "SoloUnit". e.g. "SoloUnit — local health panel".
6. Env vars: accept both `SOLOUNIT_HUB_URL`/`ONECO_HUB_URL` and `SOLOUNIT_LANG`/`ONECO_LANG` (SOLOUNIT_* wins); document only SOLOUNIT_*.

## Keep as internal (do NOT rename)

- Advisory IDs (`ONECO-2026-...`) — published data identifiers.
- `~/.oneco` state directory — existing installs; add a code comment "internal codename".
- Internal file/module names and repo directory names (tools/oneco etc.) — churn without user benefit.

## Tests + acceptance

- Update all tests/fixtures for renamed strings; `node --test tools/oneco/tests/` green.
- `npm pack --dry-run` inside tools/oneco shows name `solounit`, bin `solounit`, and the tarball includes bin/src/README.
- English output remains CJK-free; both locales show SoloUnit branding.
- Grep check: no user-visible "oneco" remains in README files, help text, dashboard/card output (internal identifiers per the keep-list are fine).
- Commit with a clear message.
