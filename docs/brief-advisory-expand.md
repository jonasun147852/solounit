# Brief — wire the 17 mined advisories into the triage hook (event-triggered)

> For a coding agent in ~/solounit. Commit to main when green; do not push. Read tools/oneco-plugin/hooks/on-failure.mjs, tools/oneco/src/advisories/seed.json and mined-draft.json first.

## The key design rule (do not violate)

There are two kinds of advisories and they must NOT be matched the same way:

- **Environment-state advisories** (seed.json today): "your setup IS in a broken state right now" — matched by `doctor` against the environment fingerprint, shown proactively on `graft`.
- **Event-triggered advisories** (mined-draft.json, all 17, tagged `"trigger":"event"`): "this only matters WHEN the error actually happens" (529 overload, OOM, ECONNRESET, etc). These must ONLY fire from the failure hook when the live error text matches — NEVER shown in doctor's proactive scan, or every user sees dozens of false "broken" items and churns.

## Work

1. **Advisory store**: merge mined-draft.json into the advisory dataset the plugin hook reads, but keep the `trigger` field. `doctor`'s proactive scan must filter to `trigger != "event"` (env-state only). The hook considers `trigger == "event"` entries (plus any env-state ones that also carry match signals).

2. **Generalize the hook matcher** (on-failure.mjs): today ERROR_SIGNALS is a hardcoded map of 4 classes. Replace it so the hook matches an advisory when ANY of that advisory's `match_signals` strings appears (case-insensitive, literal substring — these are error fragments like "529", "JavaScript heap out of memory", "ECONNRESET", not regex) in the failure event text. Keep the existing 10-minute per-advisory suppression, the fail-safe exit 0, and zero-network guarantees. Keep the context guards that prevented the earlier false positive (don't match on harness/envelope metadata — only on the tool_response/error content).

3. **Keep all 17 as `"status":"draft"`** in output labeling — they cite real GitHub issues but haven't been operator-confirmed; the hook may still surface them, labeled.

4. **Bundle**: the plugin's bundled advisories copy (tools/oneco-plugin/advisories/) must include the mined entries so an installed plugin (which has no CLI sibling) can match them offline.

## Tests + acceptance

- Fixture tests: an event like `{tool_response:{error:"API Error: 529 overloaded_error"}}` matches DRAFT-04 and surfaces its fix; an unrelated error matches nothing; the earlier false-positive fixture (npm-login "permission" text) still matches nothing.
- `doctor` proactive output does NOT include any `trigger:event` advisory (assert none of the 17 IDs appear in a doctor run on a clean fixture env).
- `node --test tools/oneco/tests/` green (add/adjust fixtures).
- Bump package version to 0.3.0.
- Commit with a clear message.
