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
    join(pluginRoot, "advisories", "mined-draft.json"),
    join(pluginRoot, "..", "oneco", "src", "advisories", "seed.json"),
    join(pluginRoot, "..", "oneco", "src", "advisories", "mined-draft.json"),
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

// Signals are literal fragments from real errors, not regular expressions.
// Both event-triggered advisories and environment-state advisories may opt in
// to failure matching by carrying at least one match signal.
function matchAdvisories(advisories, haystack) {
  const normalizedHaystack = haystack.toLowerCase();
  return advisories.filter((advisory) => {
    const signals = Array.isArray(advisory.match_signals) ? advisory.match_signals : [];
    return signals.some(
      (signal) =>
        typeof signal === "string" &&
        signal.length > 0 &&
        normalizedHaystack.includes(signal.toLowerCase()),
    );
  });
}

function failureContent(raw) {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // Plain-text stdin is itself the failure content; retain this fail-safe path.
    return raw.slice(0, 20_000);
  }

  // Never scan the whole event envelope. Harness metadata can contain broad
  // signal words unrelated to the live failure (the original false positive).
  return [event.tool_response, event.error, event.tool_error]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join("\n")
    .slice(0, 20_000);
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

  const haystack = failureContent(raw);
  if (!haystack) return;

  const hits = matchAdvisories(loadAdvisories(pluginRoot), haystack);
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
    const status = advisory.status === "draft" ? " [draft]" : "";
    return `${advisory.id}${status}: ${advisory.summary} Fix: ${fix}`;
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
