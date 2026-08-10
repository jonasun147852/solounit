---
description: First-run experience — doctor + wallet mirrors on this machine, fully local
allowed-tools: Bash
---

Run this exact command with the Bash tool and show the user its full output unmodified, then add one short closing observation of your own:

```
node "${CLAUDE_PLUGIN_ROOT}/../oneco/bin/oneco.mjs" graft
```

If `${CLAUDE_PLUGIN_ROOT}` did not expand, locate the repo copy at `the SoloUnit CLI from your clone of this repo (tools/oneco/bin/oneco.mjs)` and run that instead. Everything is local; no network is involved.
