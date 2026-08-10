# oneco Claude Code plugin

The emergency-room layer of the oneco mirrors. Two things:

1. **Emergency triage hook** (`PostToolUseFailure`): when a tool call fails inside a Claude Code session, the hook matches the failure against locally cached advisories (bundled seed + `~/.oneco/advisories.json` from `oneco sync`). On a hit, Claude tells the user in one sentence that this is a known issue and what the verified fix is. Repeats of the same advisory are suppressed for 10 minutes. Fail-safe contract: the hook exits 0 silently on any internal error and never uses the network.
2. **Slash commands**: `/oneco:graft`, `/oneco:doctor`, `/oneco:wallet`, `/oneco:sync` — thin wrappers over the CLI in `../oneco/`.

## Install (local dev)

```bash
claude plugin marketplace add <path-to-your-clone>
claude plugin install oneco@solounit
```

## Trust contract

Same as the CLI: everything local; the only network-capable path is the explicit `/oneco:sync` command. The triage hook reads the failure event and local advisory files, nothing else.
