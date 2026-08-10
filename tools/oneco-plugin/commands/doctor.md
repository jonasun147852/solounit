---
description: Match this machine's environment against known advisories (local only)
allowed-tools: Bash
---

Run this exact command with the Bash tool and show the user its full output unmodified.

```
node "${CLAUDE_PLUGIN_ROOT}/../oneco/bin/oneco.mjs" doctor
```

If `${CLAUDE_PLUGIN_ROOT}` did not expand, locate the repo copy at `the oneco CLI from your clone of this repo (tools/oneco/bin/oneco.mjs)` and run that instead.
