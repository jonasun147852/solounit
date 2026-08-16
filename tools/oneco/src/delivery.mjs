import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { setLocale, t } from "./i18n.mjs";
import { LOG_SOURCES, logRootsFor } from "./log-sources.mjs";

const SEVERITIES = ["critical", "warning", "info"];
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_LISTED_SESSIONS = 5;

const EDIT_TOOLS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "apply_patch",
  "str_replace_editor",
]);

// Only the matched prefix of a command is ever displayed, never the argv the
// user typed, so every pattern must cover the whole runner name it reports.
const CHECK_RUNNERS = Object.freeze([
  { kind: "test", pattern: /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/ },
  { kind: "test", pattern: /^node\s+--test\b/ },
  { kind: "test", pattern: /^(?:python3?\s+-m\s+)?pytest\b/ },
  { kind: "test", pattern: /^(?:go|cargo|swift|deno|dotnet|mvn)\s+test\b/ },
  { kind: "test", pattern: /^cargo\s+nextest\b/ },
  { kind: "test", pattern: /^(?:make|rake)\s+(?:test|check)\b/ },
  { kind: "test", pattern: /^(?:\.\/)?gradlew?\s+test\b/ },
  {
    kind: "test",
    pattern: /^(?:jest|vitest|mocha|ava|rspec|phpunit|tox|nox|bats|ctest|karma)\b/,
  },
  { kind: "lint", pattern: /^(?:npm|pnpm|yarn|bun)\s+run\s+lint\b/ },
  { kind: "lint", pattern: /^cargo\s+clippy\b/ },
  { kind: "lint", pattern: /^ruff\s+(?:check|format)\b/ },
  { kind: "lint", pattern: /^(?:black|prettier)\s+--check\b/ },
  { kind: "lint", pattern: /^gofmt\s+-l\b/ },
  { kind: "lint", pattern: /^(?:make|rake)\s+lint\b/ },
  {
    kind: "lint",
    pattern: /^(?:eslint|biome|rubocop|shellcheck|golangci-lint|flake8|pylint|stylelint)\b/,
  },
  { kind: "typecheck", pattern: /^(?:npm|pnpm|yarn|bun)\s+run\s+type-?check\b/ },
  { kind: "typecheck", pattern: /^cargo\s+check\b/ },
  { kind: "typecheck", pattern: /^(?:tsc|mypy|pyright|flow)\b/ },
  { kind: "build", pattern: /^(?:npm|pnpm|yarn|bun)\s+run\s+build\b/ },
  { kind: "build", pattern: /^(?:go|cargo|swift)\s+build\b/ },
  { kind: "build", pattern: /^(?:make|rake)\s+(?:build|all)\b/ },
  { kind: "build", pattern: /^(?:\.\/)?gradlew?\s+build\b/ },
  { kind: "build", pattern: /^mvn\s+(?:package|verify)\b/ },
]);

const COMMAND_SUPPRESSIONS = Object.freeze([
  { id: "no-verify", pattern: /(?:^|\s)--no-verify\b/ },
  { id: "no-verify", pattern: /^git\s+commit\b[^\n]*\s-n(?:\s|$)/ },
  { id: "no-tests", pattern: /(?:^|\s)--pass-?with-?no-?tests\b/i },
  { id: "no-tests", pattern: /(?:^|\s)SKIP_TESTS?=(?:1|true|yes)\b/i },
]);

const CONTENT_SUPPRESSIONS = Object.freeze([
  { id: "skipped-test", pattern: /\b(?:it|test|describe|context|suite)\.skip\s*\(/g },
  { id: "skipped-test", pattern: /\bx(?:it|test|describe)\s*\(/g },
  { id: "skipped-test", pattern: /@pytest\.mark\.(?:skip|skipif|xfail)\b/g },
  { id: "skipped-test", pattern: /\bunittest\.skip\b/g },
  { id: "skipped-test", pattern: /#\[ignore\]/g },
  { id: "skipped-test", pattern: /@Ignore\b/g },
  { id: "skipped-test", pattern: /\bt\.Skipf?\s*\(/g },
  { id: "focused-test", pattern: /\b(?:it|test|describe|context)\.only\s*\(/g },
  { id: "focused-test", pattern: /\bf(?:it|describe)\s*\(/g },
]);

// Assertions of completion only. Hedged prose ("this should be close", "I think
// that works") must not count, or every session becomes a claim.
const CLAIM_PATTERNS = Object.freeze([
  /\ball\s+(?:the\s+)?tests?\s+(?:now\s+)?(?:pass|passed|passing)\b/i,
  /\btests?\s+(?:are\s+)?(?:now\s+)?passing\b/i,
  /\b(?:everything|it|that|this|the\s+\w+)\s+(?:is\s+)?(?:now\s+)?(?:works|working|fixed)\b/i,
  /\bi(?:'ve|\s+have)\s+(?:fixed|resolved|implemented|completed|verified)\b/i,
  /\b(?:fix|change|implementation|migration|refactor)\s+is\s+complete\b/i,
  /\bshould\s+(?:now\s+)?work\b/i,
  /\bready\s+to\s+(?:merge|ship|commit|review)\b/i,
  /\ball\s+set\b/i,
  /\bdone\s*[.!—-]/i,
  /测试(?:全部|都)?(?:已)?通过/,
  /(?:已经|已)(?:修复|完成|实现|解决)/,
  /(?:都|全部)(?:已)?(?:通过|修好|完成)了?/,
  /(?:搞定|好了|没问题了|可以了)/,
]);

const WRAPPER_PREFIX =
  /^(?:time|sudo|nice|env|npx(?:\s+--yes)?|pnpm\s+(?:exec|dlx)|yarn\s+dlx|bunx|uvx|uv\s+run|poetry\s+run|pipenv\s+run|bundle\s+exec)\s+/;
const ENVIRONMENT_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/;

export function sessionRef(sessionId) {
  return createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 8);
}

function commandSegments(command) {
  return String(command)
    .split(/&&|\|\||[;\n|]/)
    .map((segment) => segment.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeSegment(segment) {
  let normalized = segment.replace(ENVIRONMENT_PREFIX, "");
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(WRAPPER_PREFIX, "");
  } while (normalized !== previous);
  return normalized;
}

function classifyCommand(command) {
  const text = String(command || "");
  const checks = new Map();
  for (const segment of commandSegments(text)) {
    const normalized = normalizeSegment(segment);
    for (const runner of CHECK_RUNNERS) {
      const match = normalized.match(runner.pattern);
      if (!match) continue;
      const label = match[0].replaceAll(/\s+/g, " ").trim();
      if (!checks.has(label)) checks.set(label, { runner: label, kind: runner.kind });
      break;
    }
  }

  const suppressions = new Set();
  for (const suppression of COMMAND_SUPPRESSIONS) {
    if (suppression.pattern.test(text)) suppressions.add(suppression.id);
  }
  // `npm test || true` reports success no matter what the suite did.
  if (checks.size > 0 && /\|\|\s*(?::|true)\s*(?:$|[;\n])/.test(text)) {
    suppressions.add("swallowed-failure");
  }

  return { checks: [...checks.values()], suppressions: [...suppressions] };
}

function countMatches(text, pattern) {
  if (!text) return 0;
  return (String(text).match(pattern) || []).length;
}

function contentSuppressions(added, removed = "") {
  const found = new Set();
  for (const suppression of CONTENT_SUPPRESSIONS) {
    if (countMatches(added, suppression.pattern) > countMatches(removed, suppression.pattern)) {
      found.add(suppression.id);
    }
  }
  return [...found];
}

function assertsCompletion(text) {
  const value = String(text || "");
  return CLAIM_PATTERNS.some((pattern) => pattern.test(value));
}

function textOf(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => textOf(entry, depth + 1)).join("\n");
  if (typeof value !== "object") return "";
  return [value.text, value.content, value.output, value.stdout, value.message]
    .map((entry) => textOf(entry, depth + 1))
    .join("\n");
}

function failedResult(payload) {
  if (payload?.is_error === true || payload?.isError === true) return true;
  const exitCode = Number(
    payload?.metadata?.exit_code ?? payload?.exit_code ?? payload?.exitCode,
  );
  if (Number.isFinite(exitCode)) return exitCode !== 0;
  return /\bexit(?:\s+|_)code:?\s*[1-9]/i.test(textOf(payload));
}

function jsonOrNull(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sessionState(state, sessionId, agent) {
  if (!state.sessions.has(sessionId)) {
    state.sessions.set(sessionId, { id: sessionId, agent, events: [] });
  }
  return state.sessions.get(sessionId);
}

function record(state, context, timestamp, event) {
  state.sequence += 1;
  const entry = { ...event, sequence: state.sequence, timestamp };
  sessionState(state, context.sessionId, context.agent).events.push(entry);
  return entry;
}

function recordCommand(state, context, timestamp, command, callId) {
  const { checks, suppressions } = classifyCommand(command);
  for (const suppression of suppressions) {
    record(state, context, timestamp, { kind: "suppression", suppression });
  }
  if (checks.length === 0) return false;
  const entry = record(state, context, timestamp, {
    kind: "check",
    runner: checks[0].runner,
    check_kind: checks[0].kind,
    extra_runners: checks.slice(1),
    passed: null,
  });
  if (callId) context.pending.set(callId, entry);
  return true;
}

function recordEdit(state, context, timestamp, added, removed) {
  record(state, context, timestamp, { kind: "edit" });
  for (const suppression of contentSuppressions(added, removed)) {
    record(state, context, timestamp, { kind: "suppression", suppression });
  }
}

function resolveCheck(context, callId, failed) {
  const entry = callId ? context.pending.get(callId) : null;
  if (!entry) return false;
  entry.passed = !failed;
  context.pending.delete(callId);
  return true;
}

function claudeMessage(entry) {
  const message = entry?.message;
  return message && typeof message === "object" ? message : null;
}

function parseClaudeRecord(entry, state, context, timestamp) {
  const message = claudeMessage(entry);
  const content = message?.content;
  if (!Array.isArray(content)) return false;
  let parsed = false;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;

    if (block.type === "text" && assertsCompletion(block.text)) {
      record(state, context, timestamp, { kind: "claim" });
      parsed = true;
      continue;
    }

    if (block.type === "tool_use") {
      const input = block.input || {};
      if (block.name === "Bash") {
        parsed = recordCommand(state, context, timestamp, input.command, block.id) || parsed;
        continue;
      }
      if (EDIT_TOOLS.has(block.name)) {
        const edits = Array.isArray(input.edits) ? input.edits : [input];
        recordEdit(
          state,
          context,
          timestamp,
          edits.map((edit) => textOf(edit?.new_string ?? edit?.content ?? edit?.new_source)).join("\n"),
          edits.map((edit) => textOf(edit?.old_string ?? edit?.old_source)).join("\n"),
        );
        parsed = true;
      }
      continue;
    }

    if (block.type === "tool_result") {
      const failed = failedResult(block);
      if (resolveCheck(context, block.tool_use_id, failed)) {
        parsed = true;
        continue;
      }
      if (failed) {
        record(state, context, timestamp, { kind: "error" });
        parsed = true;
      }
    }
  }

  return parsed;
}

// Codex records a shell call as argv, usually ["bash", "-lc", "<command>"].
// The wrapper has to come off or nothing matches the runner table.
function shellArgv(parts) {
  const argv = parts.map((part) => String(part));
  const isShell = /^(?:\/[\w./-]*\/)?(?:ba|z|k|c)?sh$/.test(argv[0] || "");
  if (isShell && /^-[a-z]*c$/.test(argv[1] || "")) return argv.slice(2).join(" ");
  return argv.join(" ");
}

function codexCommandOf(payload, args) {
  const direct = payload.action?.command ?? payload.input?.command ?? payload.command ??
    args?.command;
  if (Array.isArray(direct)) return shellArgv(direct);
  if (typeof direct === "string") return direct;
  return null;
}

function parseCodexRecord(entry, state, context, timestamp) {
  const payload = entry.payload || {};
  const type = String(payload.type || "");

  if (type === "message" || type === "agent_message") {
    const role = payload.role || "assistant";
    if (role !== "assistant") return false;
    if (!assertsCompletion(textOf(payload.content ?? payload.message ?? payload.text))) {
      return false;
    }
    record(state, context, timestamp, { kind: "claim" });
    return true;
  }

  if (type.endsWith("_call_output")) {
    const failed = failedResult(payload) || failedResult(jsonOrNull(payload.output));
    if (resolveCheck(context, payload.call_id || payload.id, failed)) return true;
    if (failed) {
      record(state, context, timestamp, { kind: "error" });
      return true;
    }
    return false;
  }

  if (!type.endsWith("_call")) return false;

  const args = jsonOrNull(payload.arguments);
  const command = codexCommandOf(payload, args);
  const name = String(payload.name || "");
  if (EDIT_TOOLS.has(name) || /apply_patch/.test(name) || /^\s*apply_patch\b/.test(command || "")) {
    const patch = textOf(args?.input ?? args?.patch ?? args?.content);
    recordEdit(state, context, timestamp, patch || String(command || ""), "");
    return true;
  }
  if (!command) return false;
  return recordCommand(state, context, timestamp, command, payload.call_id || payload.id);
}

function timestampOf(entry) {
  const timestamp = Date.parse(
    entry.timestamp || entry.created_at || entry.createdAt || claudeMessage(entry)?.timestamp ||
      entry.payload?.timestamp || "",
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function collectLogFiles(matches, state, cursor) {
  let entries;
  try {
    entries = await readdir(cursor, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") state.unreadable_directories += 1;
    return;
  }
  for (const entry of entries) {
    const filePath = join(cursor, entry.name);
    if (entry.isDirectory()) await collectLogFiles(matches, state, filePath);
    else if (entry.isFile() && matches(entry.name)) state.files.push(filePath);
  }
}

async function parseFile(agent, filePath, root, window, state) {
  const context = {
    agent,
    sessionId: `${agent}:${relative(root, filePath)}`,
    pending: new Map(),
  };
  let input;
  try {
    input = createReadStream(filePath, { encoding: "utf8" });
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        state.malformed_lines += 1;
        state.lines_skipped += 1;
        continue;
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        state.lines_skipped += 1;
        continue;
      }

      if (agent === "codex" && entry.type === "session_meta") {
        context.sessionId = entry.payload?.id || entry.payload?.session_id || context.sessionId;
        state.lines_parsed += 1;
        continue;
      }
      if (agent === "claude") {
        const sessionId = entry.sessionId || entry.session_id;
        if (sessionId) context.sessionId = sessionId;
      }

      const timestamp = timestampOf(entry);
      if (timestamp === null || timestamp < window.since || timestamp > window.until) {
        state.lines_skipped += 1;
        continue;
      }

      const parsed = agent === "claude"
        ? parseClaudeRecord(entry, state, context, timestamp)
        : parseCodexRecord(entry, state, context, timestamp);
      state[parsed ? "lines_parsed" : "lines_skipped"] += 1;
    }
  } catch {
    state.unreadable_files += 1;
  } finally {
    input?.destroy();
  }
}

function deliverySources(options) {
  const homeDirectory = options.homeDirectory || homedir();
  const sources = options.agent
    ? LOG_SOURCES.filter((source) => source.agent === options.agent)
    : LOG_SOURCES;
  return sources.map((source) => ({
    agent: source.agent,
    label_key: source.label_key,
    matches: source.matches,
    roots: logRootsFor(source, {
      ...options,
      homeDirectory,
      claudeLogRoot: options.claudeLogRoot || options.logRoot,
    }),
  }));
}

export async function scanDeliveryLogs(options = {}) {
  const window = {
    since: options.since instanceof Date ? options.since.getTime() : options.since || 0,
    until: options.until instanceof Date ? options.until.getTime() : options.until || Date.now(),
  };
  const state = {
    sessions: new Map(),
    sequence: 0,
    files: [],
    malformed_lines: 0,
    unreadable_files: 0,
    unreadable_directories: 0,
    lines_parsed: 0,
    lines_skipped: 0,
  };
  const sources = deliverySources(options);
  const directoriesChecked = [];

  for (const source of sources) {
    for (const root of source.roots) {
      directoriesChecked.push(root);
      const discovery = { files: [], unreadable_directories: 0 };
      await collectLogFiles(source.matches, discovery, root);
      state.unreadable_directories += discovery.unreadable_directories;
      for (const filePath of discovery.files.sort()) {
        state.files.push(filePath);
        await parseFile(source.agent, filePath, root, window, state);
      }
    }
  }

  return {
    sessions: [...state.sessions.values()],
    agents: sources.map((source) => ({ agent: source.agent, label_key: source.label_key })),
    diagnostics: {
      files_scanned: state.files.length,
      files_found: state.files.length,
      directories_checked: directoriesChecked,
      lines_parsed: state.lines_parsed,
      lines_skipped: state.lines_skipped,
      malformed_lines: state.malformed_lines,
      unreadable_files: state.unreadable_files,
      unreadable_directories: state.unreadable_directories,
    },
  };
}

function summarizeSession(session) {
  const events = [...session.events].sort((left, right) => left.sequence - right.sequence);
  const checks = [];
  const suppressions = new Set();
  let edits = 0;
  let claims = 0;
  let errors = 0;
  let lastEdit = 0;
  let lastPass = 0;
  let lastFailure = 0;
  let lastOutcome = null;
  let claimAfterFailure = false;

  for (const event of events) {
    if (event.kind === "edit") {
      edits += 1;
      lastEdit = event.sequence;
    } else if (event.kind === "check") {
      checks.push(event);
      if (event.passed === true) {
        lastPass = event.sequence;
        lastOutcome = "passed";
      } else if (event.passed === false) {
        lastFailure = event.sequence;
        lastOutcome = "failed";
      }
    } else if (event.kind === "claim") {
      claims += 1;
      if (lastOutcome === "failed") claimAfterFailure = true;
    } else if (event.kind === "error") {
      errors += 1;
    } else if (event.kind === "suppression") {
      suppressions.add(event.suppression);
    }
  }

  const verified = edits > 0 && lastPass > lastEdit;
  const unresolvedFailure = lastFailure > lastPass;
  return {
    ref: sessionRef(session.id),
    agent: session.agent,
    edits,
    checks_run: checks.length,
    checks_failed: checks.filter((check) => check.passed === false).length,
    claims,
    tool_errors: errors,
    suppressions: [...suppressions].sort(),
    verified,
    claim_after_failed_check: claimAfterFailure,
    unresolved_failure: unresolvedFailure,
    edits_never_checked: edits > 0 && checks.length === 0,
    stale_verification: edits > 0 && checks.length > 0 && !verified && !unresolvedFailure,
    checks: checks.map((check) => ({
      runner: check.runner,
      kind: check.check_kind,
      passed: check.passed,
    })),
  };
}

function checksByRunner(sessions) {
  const runners = new Map();
  for (const session of sessions) {
    for (const check of session.checks) {
      if (!runners.has(check.runner)) {
        runners.set(check.runner, {
          runner: check.runner,
          kind: check.kind,
          runs: 0,
          passed: 0,
          failed: 0,
        });
      }
      const entry = runners.get(check.runner);
      entry.runs += 1;
      if (check.passed === true) entry.passed += 1;
      else if (check.passed === false) entry.failed += 1;
    }
  }
  return [...runners.values()].sort(
    (left, right) => right.runs - left.runs || left.runner.localeCompare(right.runner),
  );
}

function whereSessions(sessions, locale) {
  const refs = sessions.slice(0, MAX_LISTED_SESSIONS).map((session) => session.ref);
  const remaining = sessions.length - refs.length;
  return t(sessions.length === 1 ? "delivery.whereSession" : "delivery.whereSessions", {
    locale,
    count: sessions.length,
    refs: remaining > 0
      ? t("delivery.refsMore", { locale, refs: refs.join(", "), more: remaining })
      : refs.join(", "),
  });
}

function listPhrase(items, locale) {
  if (items.length <= 1) return items.join("");
  return [
    items.slice(0, -1).join(t("delivery.listSeparator", { locale })),
    t("delivery.listFinal", { locale }),
    items.at(-1),
  ].join("");
}

function finding(severity, id, matches, locale, params = {}) {
  return {
    severity,
    id,
    sessions: matches.map((session) => session.ref),
    session_count: matches.length,
    what: t(`${id}.what`, { locale, ...params }),
    where: whereSessions(matches, locale),
    why: t(`${id}.why`, { locale, ...params }),
    fix: t(`${id}.fix`, { locale, ...params }),
  };
}

function buildFindings(sessions, locale) {
  const findings = [];
  const select = (predicate) => sessions.filter(predicate);

  const claimAfterFailure = select((session) => session.claim_after_failed_check);
  if (claimAfterFailure.length > 0) {
    findings.push(finding("critical", "delivery.claim_after_failed_check", claimAfterFailure, locale));
  }

  const suppressed = select((session) => session.suppressions.length > 0);
  if (suppressed.length > 0) {
    const kinds = [...new Set(suppressed.flatMap((session) => session.suppressions))].sort();
    findings.push(finding("critical", "delivery.verification_suppressed", suppressed, locale, {
      kinds: listPhrase(kinds.map((kind) => t(`delivery.suppression.${kind}`, { locale })), locale),
    }));
  }

  const neverChecked = select((session) => session.edits_never_checked);
  if (neverChecked.length > 0) {
    findings.push(finding("warning", "delivery.edits_never_checked", neverChecked, locale, {
      edits: neverChecked.reduce((sum, session) => sum + session.edits, 0),
    }));
  }

  const stale = select((session) => session.stale_verification);
  if (stale.length > 0) {
    findings.push(finding("warning", "delivery.stale_verification", stale, locale));
  }

  const unresolved = select((session) => session.unresolved_failure);
  if (unresolved.length > 0) {
    findings.push(finding("warning", "delivery.unresolved_failure", unresolved, locale));
  }

  const verified = select((session) => session.verified);
  if (verified.length > 0) {
    findings.push(finding("info", "delivery.verified", verified, locale));
  }

  return findings.sort((left, right) =>
    SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity) ||
    right.session_count - left.session_count ||
    left.id.localeCompare(right.id));
}

function agentBreakdown(sessions, agents, locale) {
  return agents.map(({ agent, label_key: labelKey }) => {
    const matches = sessions.filter((session) => session.agent === agent);
    const delivering = matches.filter((session) => session.edits > 0);
    return {
      agent,
      label: t(labelKey || `agent.${agent}`, { locale }),
      sessions: matches.length,
      sessions_with_edits: delivering.length,
      verified_sessions: delivering.filter((session) => session.verified).length,
      edits: matches.reduce((sum, session) => sum + session.edits, 0),
      checks_run: matches.reduce((sum, session) => sum + session.checks_run, 0),
    };
  }).filter((entry) => entry.sessions > 0);
}

function trustScore(sessionsWithEdits, verifiedSessions) {
  if (sessionsWithEdits <= 0) return null;
  return Math.round((verifiedSessions / sessionsWithEdits) * 100);
}

export async function createDeliveryReport(options = {}) {
  const locale = options.locale || "en";
  setLocale(locale);
  const now = options.now || new Date();
  const days = options.days || 30;
  const since = new Date(now.getTime() - days * DAY_MS);
  const scan = options.scan ||
    await scanDeliveryLogs({ ...options, since, until: now });
  const sessions = scan.sessions.map(summarizeSession)
    .sort((left, right) => right.edits - left.edits || left.ref.localeCompare(right.ref));
  const delivering = sessions.filter((session) => session.edits > 0);
  const verified = delivering.filter((session) => session.verified);
  const findings = buildFindings(sessions, locale);
  const severity = { critical: 0, warning: 0, info: 0 };
  for (const entry of findings) severity[entry.severity] += 1;

  return {
    mirror: "delivery",
    locale,
    generated_at: now.toISOString(),
    privacy: "local-only",
    window: { days, from: since.toISOString(), to: now.toISOString() },
    summary: {
      ...severity,
      total: findings.length,
      agents: scan.agents?.length || 0,
      sessions: sessions.length,
      sessions_with_edits: delivering.length,
      verified_sessions: verified.length,
      trust_score: trustScore(delivering.length, verified.length),
      edits: sessions.reduce((sum, session) => sum + session.edits, 0),
      checks_run: sessions.reduce((sum, session) => sum + session.checks_run, 0),
      checks_failed: sessions.reduce((sum, session) => sum + session.checks_failed, 0),
      claims: sessions.reduce((sum, session) => sum + session.claims, 0),
      estimate_note: t("delivery.estimateNote", { locale }),
    },
    checks_by_runner: checksByRunner(sessions),
    by_agent: agentBreakdown(sessions, scan.agents || [], locale),
    findings,
    sessions,
    diagnostics: scan.diagnostics,
  };
}

function scoreLine(report, locale) {
  const summary = report.summary;
  if (summary.trust_score === null) {
    return summary.sessions > 0
      ? t("delivery.noDeliveries", { locale, sessions: summary.sessions })
      : null;
  }
  return t("delivery.score", {
    locale,
    score: summary.trust_score,
    verified: summary.verified_sessions,
    sessions: summary.sessions_with_edits,
  });
}

export function renderDelivery(report, locale = report?.locale || "en") {
  const summary = report.summary;
  const lines = [
    t("mirror.delivery", { locale }),
    t("delivery.localReport", { locale }),
  ];

  if (summary.sessions === 0) {
    const paths = report.diagnostics?.directories_checked || [];
    lines.push(
      paths.length > 0
        ? t("delivery.noSessionsAtPaths", { locale, paths: paths.join(", ") })
        : t("delivery.noSessions", { locale }),
    );
    return lines.join("\n");
  }

  lines.push(t("delivery.periodSummary", {
    locale,
    days: report.window.days,
    sessions: summary.sessions,
    edits: summary.edits,
    checks: summary.checks_run,
  }));
  const score = scoreLine(report, locale);
  if (score) lines.push(score);

  for (const severity of SEVERITIES) {
    const matches = report.findings.filter((entry) => entry.severity === severity);
    if (matches.length === 0) continue;
    lines.push("", `${t(`delivery.severity.${severity}`, { locale })} (${matches.length})`);
    for (const entry of matches) {
      lines.push(
        `  [${entry.id}] ${entry.what}`,
        `    ${t("delivery.where", { locale, where: entry.where })}`,
        `    ${t("delivery.why", { locale, why: entry.why })}`,
        `    ${t("delivery.fix", { locale, fix: entry.fix })}`,
      );
    }
  }

  if (report.checks_by_runner.length > 0) {
    lines.push("", t("delivery.checksHeading", { locale }));
    for (const runner of report.checks_by_runner) {
      lines.push(`  ${t("delivery.checkRow", {
        locale,
        runner: runner.runner,
        runs: runner.runs,
        passed: runner.passed,
        failed: runner.failed,
      })}`);
    }
  }

  lines.push("", t("delivery.estimateNote", { locale }));
  return lines.join("\n");
}

function failedDeliveryReport(now, locale = "en") {
  setLocale(locale);
  return {
    mirror: "delivery",
    locale,
    generated_at: now.toISOString(),
    privacy: "local-only",
    window: { days: 0, from: now.toISOString(), to: now.toISOString() },
    summary: {
      critical: 0,
      warning: 0,
      info: 0,
      total: 0,
      agents: 0,
      sessions: 0,
      sessions_with_edits: 0,
      verified_sessions: 0,
      trust_score: null,
      edits: 0,
      checks_run: 0,
      checks_failed: 0,
      claims: 0,
      estimate_note: t("delivery.estimateNote", { locale }),
    },
    checks_by_runner: [],
    by_agent: [],
    findings: [],
    sessions: [],
    diagnostics: { directories_checked: [], files_found: 0, lines_parsed: 0, lines_skipped: 0 },
    error: t("delivery.error", { locale }),
  };
}

export async function runDelivery(options = {}) {
  const output = options.output || process.stdout;
  const locale = options.locale || "en";
  setLocale(locale);
  let report;
  try {
    report = await createDeliveryReport(options);
  } catch {
    report = failedDeliveryReport(options.now || new Date(), locale);
  }
  output.write(`${options.json
    ? JSON.stringify(report, null, 2)
    : renderDelivery(report, locale)}\n`);
  return report;
}

export const internals = {
  assertsCompletion,
  classifyCommand,
  commandSegments,
  contentSuppressions,
  failedResult,
  normalizeSegment,
  shellArgv,
  summarizeSession,
  trustScore,
};
