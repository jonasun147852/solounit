# Brief — publish polish: npx entry, CI, badges

> For a coding agent working in the `~/oneco` public repo (github.com/jonasun147852/oneco). Commit to `main` when green; you MAY push (this is the public repo, pushing is intended). Read the existing README.md and tools/oneco/package.json first.

## Goal

Make a skeptical developer trust this in 30 seconds: one-line install, green CI badge, npx-runnable. Do NOT change any mirror logic or the trust contract — this is packaging only.

## 1. npx-runnable package

- Make `tools/oneco` publishable to npm as package `oneco` (check name availability is NOT your job — assume it; if taken the user will rename later).
- Remove `"private": true`.
- Add `"files"`, `"repository"`, `"homepage"`, `"bugs"`, `"license": "MIT"`, `"keywords"` (claude-code, ai-agents, cli, local-first, cost, security-audit) to package.json.
- Add a `"bin"` that works via `npx oneco <command>` — it already has `bin.oneco`; verify the shebang line in bin/oneco.mjs is `#!/usr/bin/env node` and the file is executable.
- Add a `prepublishOnly` script that runs the tests.
- The package must stay dependency-free (zero runtime deps) — do not add anything.

## 2. Root-level convenience

- Add a root `package.json` (workspace-style or a thin wrapper) so `npm test` at repo root runs the oneco tests, and document `npx oneco graft` as the primary install path in README.
- Add a `.gitignore` (node_modules, .DS_Store, ~/.oneco artifacts, *.log).

## 3. GitHub Actions CI

- `.github/workflows/ci.yml`: on push + PR to main, matrix Node 22 + 24, run `npm ci || npm install` then the oneco test suite (`node --test tools/oneco/tests/`). Must be green on the current code.
- Keep it minimal and fast; no external actions beyond `actions/checkout` and `actions/setup-node`.

## 4. README polish

- Top: a badge row — CI status badge (GitHub Actions), MIT license badge, "Node >=22" badge, and a "local-only • no telemetry" shields.io static badge. Use shields.io URLs (they render as images; this is a README, external image refs are fine on GitHub).
- Change the install section so the FIRST thing shown is:
  ```
  npx oneco graft
  ```
  with the git-clone method as a secondary "or run from source" note.
- Add a one-line "What you'll see" with a realistic (sanitized, no real dollar figures or paths) sample of graft output so a visitor knows what they get before installing.
- Keep the trust contract section prominent.

## Acceptance

- `node --test tools/oneco/tests/` green.
- CI workflow file valid YAML, jobs defined for Node 22 and 24.
- README shows `npx oneco graft` as the primary command and has a badge row.
- Committed and pushed to main. Report the commit SHA.
- Do NOT publish to npm (the user will run `npm publish` themselves — it needs their credentials). Just make it publish-ready and say so.
