# oneco

**When your agent acts up, run oneco first.**

Private mirrors for AI-agent power users. One command inspects your local agent environment and tells you, in 60 seconds, what's already broken, what your usage really costs, and what access you've granted that could bite you — **entirely on your machine. Nothing leaves it.**

```bash
git clone https://github.com/jonasun147852/oneco.git
node oneco/tools/oneco/bin/oneco.mjs graft
```

## The mirrors

| Mirror | What it tells you |
| --- | --- |
| **Doctor** | "4 things in your setup are known-broken — here are the verified fixes." Matches your environment against a curated advisory database. |
| **Wallet** | "Your agent burned $X (API-equivalent) last month — $Y of it looks like waste." Parses your local Claude Code session logs: retry storms, context bloat, tier mismatch. `--html` renders a shareable card. |
| **Audit** | "2 plaintext API keys, 1 over-broad permission, 23 MCP servers installed." Reviews the access you've granted your agent. Secrets are always masked. |
| **Dashboard** | `oneco dashboard --open` — all mirrors as one local HTML panel. |

## Emergency triage (Claude Code plugin)

Install the plugin and failures get diagnosed the moment they happen: when a tool call errors inside a session, oneco matches it against known advisories and tells you *"this is a known issue, not something you did wrong — here's the fix."*

```bash
claude plugin marketplace add jonasun147852/oneco
claude plugin install oneco@oneco
```

Commands: `/oneco:graft` · `/oneco:doctor` · `/oneco:wallet` · `/oneco:sync`

## The trust contract

1. **Everything runs locally.** The only network-capable path is the explicit `oneco sync` command (fetches fresh advisories; never sends anything).
2. **No free-text telemetry exists in the schema.** There is nowhere to leak your content, by construction.
3. **Secrets never appear in any output** — location, first 6 characters, and length only.
4. Advisory signals are data, not instructions: nothing from the network is ever auto-executed.

This tool is the entry point of a trust-first network for people and their agents — where members' agents share anonymized failure signals so everyone gets immune before they hit the same wall. The network layer is invite-only and under construction.

## Requirements

Node >= 22. macOS tested; Linux should work for wallet/doctor (audit's file-permission checks are POSIX).

## License

MIT
