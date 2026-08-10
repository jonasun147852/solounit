# oneco

`oneco` is a dependency-free CLI with three offline mirrors and a local visual dashboard for Claude Code power-users:

- **Doctor（修理镜）** compares a local environment fingerprint with bundled, git-versioned advisories.
- **Audit（安全镜）** reviews granted agent access, hooks, credential exposure, permissions, and local integration names.
- **Wallet（钱包镜）** turns local Claude Code usage records into an API-equivalent usage and potential-savings report.

Advisory updates are an explicit, separate action. Only `oneco sync` may use the network; the mirrors never do.

Node.js 22 or newer is required. The package has zero runtime dependencies.

## Run

```sh
npx oneco graft
```

**What you'll see:** `Graft complete: Doctor matched [local count] setup advisories. Wallet reports [local total] in API-equivalent usage and up to [local estimate] in potential savings; all analysis stayed on this machine.`

Or run from source:

```sh
git clone https://github.com/jonasun147852/oneco.git
node oneco/tools/oneco/bin/oneco.mjs graft
```

## Commands

```sh
oneco doctor
oneco doctor --json
oneco audit
oneco audit --json
oneco sync --url http://localhost:8787
oneco wallet
oneco wallet --days 7
oneco wallet --days 30 --json
oneco wallet --html
oneco wallet --days 7 --html ./wallet-card.html
oneco dashboard
oneco dashboard --out ./oneco-panel.html
oneco dashboard --open
oneco graft
```

`doctor` reports only advisories that match the installed tool, version range, and every required fingerprint dimension. A doctor report always exits with status 0 because it is a mirror, not a CI gate. The bundled seed entries are marked `draft` for operator review and cite scrubbed transcript filename/line evidence.

`audit` performs a bounded, local security review and always exits with status 0 because its findings are a report, not a CI gate. It inventories configured MCP servers, plugins, and skills; lists hook commands; detects hooks that use network-capable binaries or paths outside the user home; checks credential-shaped values without printing them; reviews broad permission allowlists; checks credential-candidate file modes; and matches installed names against the bundled known-bad seed. Terminal and JSON findings have the same `severity`, `id`, `what`, `where`, `why`, and `fix` fields.

Credential findings disclose only the file and line, the first six characters, and the value length. Full values are discarded from findings and pass through a second masking boundary immediately before either terminal or JSON output. Hook commands and all other configuration-derived strings use the same masking boundary.

The known-bad registry is `src/security/known-bad-seed.json`. Each entry has `id`, `kind`, `name_pattern`, `severity`, `summary`, `source`, and `published`; `status: "example"` entries document the schema and are always skipped. The bundled seed intentionally contains zero real entries and one clearly marked example. Intelligence will arrive later through the explicit sync channel—local audit never fetches it or invents incidents.

`sync` fetches `GET <base-url>/api/advisories`, validates every returned advisory, and atomically replaces `~/.oneco/advisories.json`. Pass the hub explicitly:

```sh
oneco sync --url http://localhost:8787
```

Alternatively, set `ONECO_HUB_URL`. There is deliberately no built-in server URL: if neither the flag nor the environment variable is set, sync prints instructions and exits with status 1. A successful sync reports both the number fetched and the cache update time. When an advisory ID exists in both sources, the synced cache version wins.

`wallet` defaults to the last 30 days. It deduplicates split assistant records by Claude message ID, sums input, output, cache-read, five-minute cache-write, and one-hour cache-write tokens per model, then applies the bundled prices in `src/pricing.json`. Unknown models remain visible as unpriced tokens and never stop the report.

The headline is **API-equivalent usage**, not an estimated bill: “What this usage would cost at API list prices — subscription users: this is what your plan absorbed, not your bill.” The waste summary is framed as **potential savings if optimized**. Existing JSON price field names remain stable, and the JSON report includes a top-level `framing` object with these labels and the explainer.

`oneco wallet --html [path]` writes a self-contained share card with inline CSS and no scripts or external requests. The default path is `~/.oneco/wallet-card.html`; the CLI prints the completed path. The card contains only aggregate numbers and model names—never transcript content, file paths, or session names. Like the terminal and JSON wallet modes, HTML generation is entirely local.

`oneco dashboard [--out PATH] [--open]` runs Doctor, Wallet, and Audit in-process and writes a self-contained visual health panel. Until a cognition mirror exists, its fourth card is clearly labeled “Coming soon.” The default path is `~/.oneco/dashboard.html`; `--out` selects another local path, and `--open` launches the completed file in the OS default browser without shell interpolation.

The dashboard is fully local: its HTML has inline CSS, no scripts, no links, no web fonts, and zero external requests. It renders Audit's already-masked findings and applies the same credential-redaction boundary once more before writing the file. It never re-reads raw secret values.

`graft` runs doctor and wallet, preserves its existing two-sentence summary, and appends a fourth local audit summary section. When audit has findings, graft points to `oneco audit` for detail. It closes by pointing to `oneco dashboard --open` for the visual panel. It is intended for first-run onboarding.

## Privacy and network guarantee

`doctor`, `audit`, `wallet`, `dashboard`, and `graft` are 100% offline, including when no advisory cache exists:

- They do not use network APIs, sockets, telemetry, DNS lookups, or update checks.
- No transcript, configuration, fingerprint, token count, or report leaves the machine.
- Files under `~/.claude` and project configuration files are read-only; `oneco` never edits them.
- Transcript message text and tool payloads are not retained or printed. Wallet keeps only aggregate usage, timestamps, model names, session grouping, retry metadata, and content/tool type markers needed by its heuristics.
- Doctor never prints configuration commands, environment values, credentials, or MCP configuration payloads.
- Audit never follows symlinks, prints full credential values, or scans beyond its documented fixed files and bounded `~/Documents` project search.

Doctor may execute the local `claude --version` binary when it is already on `PATH`. All other tool and package-manager detection is a local executable-presence check.

`sync` is the sole networked command and runs only when invoked explicitly. It sends only a GET request to the configured advisory endpoint; it does not read or upload environment fingerprints, Claude configuration, transcripts, token counts, or reports.

## Files read

Doctor tolerates every file being absent or malformed and checks:

- `~/.claude.json`
- `~/.claude/settings.json`
- `~/.claude/plugins/installed_plugins.json`
- `.claude/settings.json` and `.mcp.json` from the current directory and its ancestors
- local Claude update/download metadata only when `claude --version` is unavailable
- `~/.oneco/advisories.json`, if it was created by an earlier explicit sync

Audit tolerates every file being absent or malformed and checks only:

- `~/.claude.json`
- `~/.claude/settings.json`
- `~/.claude/plugins/installed_plugins.json`
- Project `.mcp.json` and `.claude/settings.json` files below `~/Documents`, with project directories bounded to depth 3; dependency, build, and Git metadata directories are skipped
- `~/.zshrc`, `~/.zshenv`, `~/.env`, the two Claude configuration files above, and `.env` at each discovered project root for credential shapes and group/world read modes
- The bundled `src/security/known-bad-seed.json`

The audit scan never searches the full filesystem, plugin payload directories, repository contents, or transcript files.

Wallet recursively reads `*.jsonl` files under `~/.claude/projects/`, including nested subagent and workflow transcripts. Synthetic test fixtures live under `tests/fixtures/`; real transcripts are never copied into this repository.

## Observed transcript format

The transcripts on the machine used for this phase differ from a flat message-only stream:

- Assistant usage is stored under `message.usage` and includes a nested `cache_creation` breakdown.
- A single assistant response can be split across several JSONL records with the same `message.id` and repeated usage totals.
- Subagent and workflow transcripts are nested below a parent session directory.
- API failures are `system` records with subtype `api_error`, timestamped retry counters, maximum retries, and sometimes HTTP status metadata.
- Queue, attachment, title, hook-summary, and other non-usage record types appear in the same files.

The parser handles those records line by line, skips malformed lines, and deduplicates repeated message and retry IDs before doing arithmetic.

## Pricing and estimates

The bundled table records published Claude API prices as of 2026-08-09 from the [Claude Platform pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing). It includes Claude Fable 5, Opus 5, Opus 4.8, Sonnet 5 introductory pricing through 2026-08-31, and Haiku 4.5—the model families observed in the local logs. API-price equivalents are not necessarily charges on a Claude subscription invoice.

All waste figures are explicitly estimates:

- **Retry storms:** two or more API retry/error records in a two-minute window. Recorded retry usage is priced directly when present; otherwise the input-side cost of the nearest usage-bearing turn within five minutes is used as a proxy.
- **Context bloat:** sessions at or above the 90th percentile for average input tokens per turn. Potential excess above the all-turn median is priced at each turn's observed effective input/cache rate.
- **Tier mismatch:** long sessions where at least five and at least half of all turns are short, tool-only turns on the largest priced tier. Potential savings compare those turns with the next smaller bundled tier.

Waste buckets can overlap. The combined potential-savings-if-optimized number is capped at API-equivalent usage and must not be treated as a billing fact or an accusation.

## Tests

From the repository root:

```sh
npm run test:oneco
```

Or directly:

```sh
node --test tools/oneco/tests/
```
