#!/usr/bin/env node
// SoloUnit emergency triage — PostToolUseFailure hook.
// Reads the failure event from stdin, matches it against locally cached
// advisories, and (on a hit) hands Claude a one-line diagnosis to relay.
// Fail-safe contract: any internal error exits 0 silently — this hook must
// never break or slow a session. No network, ever.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SUPPRESS_MS = 10 * 60 * 1000;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function loadAdvisories(pluginRoot) {
  const sources = [
    join(pluginRoot, "advisories", "seed.json"),
    join(pluginRoot, "..", "oneco", "src", "advisories", "seed.json"),
    // ".oneco" is the internal codename; keep it for compatibility with existing installs.
    join(homedir(), ".oneco", "advisories.json"),
  ];
  const byId = new Map();
  for (const file of sources) {
    try {
      if (!existsSync(file)) continue;
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      const list = Array.isArray(parsed) ? parsed : parsed.advisories;
      for (const advisory of list ?? []) {
        if (advisory?.id) byId.set(advisory.id, advisory);
      }
    } catch {
      // Unreadable source: skip it; triage works with whatever loaded.
    }
  }
  return [...byId.values()];
}

// Keyword classes let one advisory match many phrasings of the same wound.
// `guard` (optional) must ALSO match, scoping broad words to their context —
// first live firing (2026-08-10) hit a false positive: "permission" matched
// harness metadata on an npm auth error. Match narrowly; silence is cheaper
// than a wrong diagnosis (alert habituation taxes every future alert).
const ERROR_SIGNALS = {
  "credential-refresh-retry-loop": { patterns: [/\b401\b/, /unauthorized/i, /authentication failed/i] },
  "gateway-retry-storm": { patterns: [/\b502\b/, /\b503\b/, /bad gateway/i, /upstream/i] },
  "mcp-health-connection-failure": {
    patterns: [/econnrefused/i, /connect(ion)? (failed|refused|error)/i, /health check/i],
  },
  "preview-start-permission-state": {
    patterns: [/permission/i, /not permitted/i, /eperm/i],
    guard: /preview|browser/i,
  },
};

function matchAdvisories(advisories, haystack, toolName) {
  const hits = [];
  const scope = `${toolName}\n${haystack}`;
  for (const advisory of advisories) {
    const entry = ERROR_SIGNALS[advisory.error_class] ?? { patterns: [] };
    const nameHit =
      advisory.affected?.name &&
      advisory.affected.name !== "claude-code" &&
      toolName.toLowerCase().includes(advisory.affected.name.toLowerCase());
    const guardOk = !entry.guard || entry.guard.test(scope);
    const signalHit = guardOk && entry.patterns.some((pattern) => pattern.test(haystack));
    if (signalHit || (nameHit && entry.patterns.length === 0)) hits.push(advisory);
  }
  return hits;
}

function loadSuppressions(file) {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // Corrupt suppression state: treat as empty rather than fail.
  }
  return {};
}

function main() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
  const raw = readStdin();
  if (!raw) return;

  let event = {};
  try {
    event = JSON.parse(raw);
  } catch {
    // Unparseable event: still try a plain-text match below.
  }
  const toolName = String(event.tool_name ?? "");
  // Match against the failure content only — never the whole event envelope,
  // whose harness metadata contains words like "permission" that poison
  // keyword matching (root cause of the first live false positive).
  const errorBody = event.tool_response ?? event.error ?? event.tool_error ?? null;
  const haystack = (errorBody ? JSON.stringify(errorBody) : raw).slice(0, 20_000);

  const hits = matchAdvisories(loadAdvisories(pluginRoot), haystack, toolName);
  if (!hits.length) return;

  const stateDir = join(homedir(), ".oneco");
  const suppressFile = join(stateDir, "triage-suppress.json");
  const suppressions = loadSuppressions(suppressFile);
  const now = Date.now();
  const fresh = hits.filter((advisory) => {
    const last = suppressions[advisory.id] ?? 0;
    return now - last > SUPPRESS_MS;
  });
  if (!fresh.length) return;

  try {
    mkdirSync(stateDir, { recursive: true });
    for (const advisory of fresh) suppressions[advisory.id] = now;
    writeFileSync(suppressFile, JSON.stringify(suppressions));
  } catch {
    // Suppression bookkeeping is best-effort.
  }

  const lines = fresh.map((advisory) => {
    const fix = (advisory.fix_steps ?? []).join(" → ");
    return `${advisory.id}: ${advisory.summary} Fix: ${fix}`;
  });
  const context = [
    "SoloUnit emergency triage (local advisory match — this failure is a known issue, not something the user did wrong):",
    ...lines,
    "Relay the matching diagnosis and fix to the user in one short sentence before continuing.",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUseFailure",
        additionalContext: context,
      },
    }),
  );
}

try {
  main();
} catch {
  // Never let triage become its own failure.
}
process.exit(0);
