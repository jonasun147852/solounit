---
description: Whether the work your agent said it finished was ever verified (local only)
allowed-tools: Bash
---

Run this exact command with the Bash tool and show the user its full output unmodified. You may pass through a --days N argument if the user asked for a different window.

```
node "${CLAUDE_PLUGIN_ROOT}/../oneco/bin/oneco.mjs" delivery
```

If `${CLAUDE_PLUGIN_ROOT}` did not expand, locate the repo copy at `the SoloUnit CLI from your clone of this repo (tools/oneco/bin/oneco.mjs)` and run that instead.
