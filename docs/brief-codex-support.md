# Brief — add Codex CLI support to wallet + doctor

> For a coding agent in ~/solounit. Commit to main when green; do not push. Read tools/oneco/src/claude-logs.mjs (or wherever session parsing lives), wallet.mjs, pricing.json first.

## Goal

Today wallet/doctor only read Claude Code logs (`~/.claude/projects/*.jsonl`). Add **Codex CLI** as a second source so Codex-heavy users get real numbers from `npx solounit graft`. This roughly doubles the addressable audience. The tool auto-detects which agents have logs and reports per-agent, clearly labeled.

## Codex log format (verified on this machine)

- Location: `~/.codex/sessions/**/rollout-*.jsonl` and `~/.codex/archived_sessions/rollout-*.jsonl` (recursive; tolerate absence).
- Each file is JSONL. Relevant lines:
  - `type:"session_meta"` (first line) — session id, and model info (check the payload for a model/cwd field).
  - `type:"turn_context"` — may carry the model for that turn.
  - `type:"event_msg"` with `payload.type:"token_count"` — carries `info.total_token_usage` (CUMULATIVE for the session) and `info.last_token_usage` (this turn). Fields: `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_output_tokens`, `total_tokens`. Also `info.model_context_window` and `rate_limits`.
  - `type:"response_item"` — the actual messages/tool calls (for waste heuristics like retry storms, count error/tool-failure items).
- Cost math: use `total_token_usage` (the last token_count event's cumulative value per session is the session total, OR sum `last_token_usage` across turns — pick the correct one by checking whether total is cumulative; the sample shows total growing across turns, so the LAST token_count event's `total_token_usage` is the session total). Price with pricing.json; Codex models may differ from Claude — add any Codex/GPT model names found to pricing.json with a clear source comment, and degrade unknown models to "unpriced" (never crash).

## Work

1. New parser `src/codex-logs.mjs` mirroring the Claude one's interface, returning the same normalized shape (per-session: model, input/output/cached tokens, timestamps, error/retry counts).
2. **Auto-detection**: a source registry — for each agent (claude, codex), detect if its log dir exists and has files. wallet/doctor/audit iterate detected sources.
3. **Reporting**: wallet output groups by agent when more than one is present ("Claude Code" / "Codex"), each with its own spend + waste; a combined total at top. If only one agent has logs, no behavior change from today. `--agent claude|codex` flag to scope. `--json` includes an `agent` field per row.
4. Doctor: its advisories are already fingerprint/event based — just make sure Codex being present adds `codex:*` to the environment fingerprint dims so codex-specific advisories could match later (none yet, that's fine).
5. Dashboard + `graft`: reflect multi-agent wallet output.
6. i18n: any new labels ("Codex", "by agent") go through the existing en/zh catalog.

## Trust rule (unchanged)

100% local. Codex logs read read-only, same as Claude logs. No new network. Nothing about content leaves the machine — only aggregate token counts are computed.

## Tests + acceptance

- Fixtures: synthetic Codex rollout JSONL in tests/fixtures covering token_count events and multi-turn cumulative totals; assert correct session-total math (don't double-count cumulative), correct model attribution, unknown-model → unpriced.
- Multi-agent wallet test: both claude+codex fixtures present → grouped output with correct combined total.
- English output stays CJK-free; existing tests green.
- Real run on THIS machine: `node tools/oneco/bin/oneco.mjs wallet` shows both Claude and Codex sections with real numbers.
- Bump to 0.4.0. Commit clearly.
