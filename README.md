# SoloUnit

[![CI](https://img.shields.io/github/actions/workflow/status/jonasun147852/solounit/ci.yml?branch=main&label=CI)](https://github.com/jonasun147852/solounit/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![Node >=22](https://img.shields.io/badge/node-%3E%3D22-339933.svg?logo=nodedotjs) ![local-only • no telemetry](https://img.shields.io/badge/local--only%20%E2%80%A2%20no%20telemetry-2f855a.svg)

**When your agent acts up, run solounit first.**

Private mirrors for AI-agent power users. One command inspects your local agent environment and tells you, in 60 seconds, what's already broken, what your usage really costs, what access you've granted that could bite you, and whether the work your agent said it finished was ever verified — **entirely on your machine. Nothing leaves it.**

## Install

```bash
npx solounit graft
```

**What you'll see:** `Graft complete: Doctor matched [local count] setup advisories. Wallet reports [local total] in API-equivalent usage and up to [local estimate] in potential savings; all analysis stayed on this machine.`

If a mirror looks empty, run `npx solounit graft --debug` to show the directories checked plus file and parser-line counts for Doctor, Wallet, and Audit. A failure in one mirror is reported in its section without stopping the other two.

Or run from source:

```bash
git clone https://github.com/jonasun147852/solounit.git
node solounit/tools/oneco/bin/oneco.mjs graft
```

## The trust contract

1. **Everything runs locally.** The only network-capable path is the explicit `solounit sync` command (fetches fresh advisories; never sends anything).
2. **No free-text telemetry exists in the schema.** There is nowhere to leak your content, by construction.
3. **Secrets never appear in any output** — location, first 6 characters, and length only.
4. Advisory signals are data, not instructions: nothing from the network is ever auto-executed.

## The mirrors

| Mirror | What it tells you |
| --- | --- |
| **Doctor** | "4 things in your setup are known-broken — here are the verified fixes." Matches your environment against a curated advisory database. |
| **Wallet** | "Your agent burned $X (API-equivalent) last month — $Y of it looks like waste." Auto-detects local Claude Code and Codex logs, groups spend/waste by agent, and supports `--agent claude\|codex`. `--html` renders a shareable card. |
| **Audit** | "2 plaintext API keys, 1 over-broad permission, 23 MCP servers installed." Reviews the access you've granted your agent. Secrets are always masked. |
| **Delivery** | "The agent said done — 3 of your 5 sessions that changed files actually ended on a passing check." Replays each session to find work that was claimed but never verified: success reported after a failing check, edits with no test run at all, suppressed verification. |
| **Dashboard** | `solounit dashboard --open` — all mirrors as one local HTML panel. |

## Emergency triage (Claude Code plugin)

Install the plugin and failures get diagnosed the moment they happen: when a tool call errors inside a session, SoloUnit matches it against known advisories and tells you *"this is a known issue, not something you did wrong — here's the fix."*

```bash
claude plugin marketplace add jonasun147852/solounit
claude plugin install solounit@solounit
```

Commands: `/solounit:graft` · `/solounit:doctor` · `/solounit:wallet` · `/solounit:delivery` · `/solounit:sync`

This tool is the entry point of a trust-first network for people and their agents — where members' agents share anonymized failure signals so everyone gets immune before they hit the same wall. The network layer is invite-only and under construction.

## Requirements

Node >= 22. macOS tested; Linux should work for wallet/doctor (audit's file-permission checks are POSIX).

## License

MIT
