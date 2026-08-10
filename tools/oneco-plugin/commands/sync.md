---
description: Explicitly fetch fresh advisories from the hub (the only command that uses the network)
allowed-tools: Bash
---

Run this exact command with the Bash tool and show the user its full output unmodified. Requires --url or SOLOUNIT_HUB_URL; if unset, show the user the instructions the command prints.

```
node "${CLAUDE_PLUGIN_ROOT}/../oneco/bin/oneco.mjs" sync
```

If `${CLAUDE_PLUGIN_ROOT}` did not expand, locate the repo copy at `the SoloUnit CLI from your clone of this repo (tools/oneco/bin/oneco.mjs)` and run that instead.
