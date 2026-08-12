import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseClaudeLogs } from "./claude-logs.mjs";
import { parseCodexLogs } from "./codex-logs.mjs";

export const LOG_SOURCES = Object.freeze([
  Object.freeze({
    agent: "claude",
    label_key: "agent.claude",
    roots: (homeDirectory) => [join(homeDirectory, ".claude", "projects")],
    matches: (name) => name.endsWith(".jsonl"),
    parse: ({ roots, ...options }) => parseClaudeLogs({ ...options, logRoot: roots[0] }),
  }),
  Object.freeze({
    agent: "codex",
    label_key: "agent.codex",
    roots: (homeDirectory) => [
      join(homeDirectory, ".codex", "sessions"),
      join(homeDirectory, ".codex", "archived_sessions"),
    ],
    matches: (name) => name.startsWith("rollout-") && name.endsWith(".jsonl"),
    parse: ({ roots, ...options }) => parseCodexLogs({ ...options, logRoots: roots }),
  }),
]);

export function logRootsFor(source, options = {}) {
  if (source.agent === "claude" && options.claudeLogRoot) {
    return [options.claudeLogRoot];
  }
  if (source.agent === "codex" && options.codexLogRoots) {
    return options.codexLogRoots;
  }
  return source.roots(options.homeDirectory || homedir());
}

async function containsLogFile(root, matches) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && matches(entry.name)) return true;
    if (entry.isDirectory() && await containsLogFile(join(root, entry.name), matches)) {
      return true;
    }
  }
  return false;
}

export async function detectLogSources(options = {}) {
  if (options.agent && !LOG_SOURCES.some((source) => source.agent === options.agent)) {
    throw new Error(`Unsupported agent: ${options.agent}`);
  }
  const sources = options.agent
    ? LOG_SOURCES.filter((source) => source.agent === options.agent)
    : LOG_SOURCES;
  const detected = [];
  for (const source of sources) {
    const roots = logRootsFor(source, options);
    let present = false;
    for (const root of roots) {
      if (await containsLogFile(root, source.matches)) {
        present = true;
        break;
      }
    }
    if (present) detected.push({ ...source, roots });
  }
  return detected;
}

export async function parseDetectedLogSources(options = {}) {
  const detected = options.detectedSources || await detectLogSources(options);
  const reports = [];
  for (const source of detected) {
    reports.push({
      agent: source.agent,
      label_key: source.label_key,
      logs: await source.parse({ roots: source.roots, since: options.since, until: options.until }),
    });
  }
  return reports;
}
