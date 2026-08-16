# Brief — the delivery mirror: did the agent actually do what it said?

> For a coding agent in ~/solounit. Read src/wallet.mjs, src/audit.mjs, src/log-sources.mjs and src/claude-logs.mjs first — this mirror reuses their source detection and follows the audit mirror's finding shape.

## Goal

Doctor answers "what is broken in my setup", Wallet answers "what did this cost", Audit answers "what access did I grant". None of them answer the question that actually decides whether you can leave an agent alone:

**The agent said "done, tests pass." Was that true?**

Add a fourth mirror — **Delivery** — that reads the same local session logs and reports, per session, whether the work the agent claimed to finish was ever verified. This is a trust instrument, not a linter: it never judges the code, only the gap between what was claimed and what was run.

## What it reads

The same sources the wallet already detects (`LOG_SOURCES`): Claude Code `~/.claude/projects/**/*.jsonl` and Codex `~/.codex/sessions|archived_sessions/**/rollout-*.jsonl`. Read-only, offline, no new network path.

Four event kinds are extracted per session, in order:

- **edit** — a tool call that mutates files (`Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `apply_patch`).
- **check** — a shell command that verifies something, matched against a curated runner table and classified `test` / `lint` / `typecheck` / `build`. Pass or fail comes from the tool result (`is_error`, `exit code N`, Codex `metadata.exit_code`).
- **claim** — assistant prose asserting completion ("all tests pass", "已修复"), matched against an explicit pattern list, en + zh.
- **suppression** — a command or edit that disables verification: `--no-verify`, `--passWithNoTests`, `|| true` after a check, `it.skip(` / `xit(` / `@pytest.mark.skip` / `#[ignore]` / `t.Skip(`, and focused tests (`.only(`).

## Privacy — stricter than the other mirrors

The trust contract is the product. This mirror reads prose and command lines, so it must emit less than it reads:

1. **No command strings in output.** Only the matched runner id (`npm test`, `pytest`) — never the argv the user actually typed.
2. **No transcript text in output.** Claims are counted, never quoted.
3. **No session identifiers in output.** Codex falls back to a file path as its session id, so every session is referenced by the first 8 hex of a SHA-256 of its id. Stable across runs, reversible by nobody.
4. Everything else follows the existing contract: local-only, zero network requests, exit code 0.

## What it reports

Per session: edits, checks run, checks failed, claims, and the two derived facts that matter —
`verified` (a passing check strictly after the last edit) and `claim_after_failed_check`.

Findings use the audit mirror's shape (`severity` / `id` / `what` / `where` / `why` / `fix`):

| Severity | id | Fires when |
| --- | --- | --- |
| critical | `delivery.claim_after_failed_check` | the agent asserted success and the most recent check before that claim had failed |
| critical | `delivery.verification_suppressed` | verification was disabled or its failure swallowed |
| warning | `delivery.edits_never_checked` | a session changed files and ran no check at all |
| warning | `delivery.stale_verification` | checks ran, but the last edit landed after the last passing check |
| warning | `delivery.unresolved_failure` | a session ended on a failed check with no passing re-run |
| info | `delivery.verified` | sessions that ended with a passing check after the last edit — the good outcome, stated out loud |

Headline number: **delivery trust score** = verified sessions ÷ sessions that changed files, as a percentage. `null`, not `0`, when nothing changed files — an empty month is not a 0% month.

## Work

1. `src/delivery.mjs`: event extraction for both agents, session assembly, findings, `createDeliveryReport` / `renderDelivery` / `runDelivery`, `internals` export for tests.
2. New command `solounit delivery [--days 30] [--agent claude|codex] [--json]`; help text in both locales.
3. `graft`: a Delivery section after Audit, isolated in its own try/catch like the other three, contributing to `--debug` output.
4. Dashboard: a Delivery card. Keep the 2×2 mirror grid (Doctor, Wallet, Audit, Delivery); the Cognition placeholder becomes a full-width slim banner below it.
5. i18n: every new string in en and zh; English output stays CJK-free.
6. Empty states follow the graft-resilience brief — say what was scanned, never render a blank.

## Tests + acceptance

- Fixtures: a Claude session that edits then passes `npm test`; one that edits, fails, and claims success anyway; one that edits and never checks; a Codex rollout using `local_shell_call` + `function_call_output` with `metadata.exit_code`.
- Assert the trust score math, each finding firing exactly on its fixture, and `null` (not `0`) when no session changed files.
- Assert the report contains no raw command string, no session id, and no transcript text — including a fixture whose command carries a secret-looking argument.
- Existing tests stay green; English output CJK-free; bump to 0.6.0.
