# Brief — graft must never silently stop after one mirror

> For a coding agent in ~/solounit. Commit to main when green; do not push.

## Real-world failure (first external user, 2026-08-12)

A user on a different machine (Claude Code 2.1.138 + Codex 0.146.0, Node 24, macOS) ran `npx solounit graft` and the visible output ended after the Doctor section with "0 of 4 local advisories matched." Wallet and Audit either never rendered or threw. This is the worst possible first impression: the user concludes the tool does nothing.

## Work

1. **Isolate each mirror in graft**: wrap doctor / wallet / audit each in its own try/catch. If one throws, print a short, honest line for that section (e.g. "Wallet could not read your logs: <one-line reason>. Run `solounit wallet` for details.") and CONTINUE to the next mirror. graft must always render all three section headers.
2. **Empty-state must still be useful** — for each mirror, when there are zero findings/zero data, print what WAS scanned (counts), not just a negative. Examples: doctor → "Scanned N advisories against your fingerprint (claude 2.1.x, codex 0.14.x, darwin)."; wallet → if no sessions found, say which directories were checked and that no session logs were found there; audit → "Reviewed N MCP servers / N config files, nothing risky found."
3. **Wallet robustness**: if a log directory exists but parsing yields zero priced turns, say so explicitly with the directory paths checked and the number of files seen. Never render a silent/blank section. Handle older/newer Claude Code and Codex log schema variants defensively (missing usage fields, different key names) — skip unparseable lines rather than throwing.
4. **Exit code stays 0** for all of the above (it is a report, not a gate).
5. Add a `--debug` flag that prints, per mirror: directories checked, files found, lines parsed, lines skipped. This is what we ask a user to run when their output looks empty.

## Tests

- A fixture where wallet throws → assert doctor and audit sections still render and a wallet error line appears.
- A fixture with an empty/absent log dir → assert wallet prints the "checked these paths, found no sessions" message, not a blank.
- Existing tests stay green; bump to 0.5.0.
