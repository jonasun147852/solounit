import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { createInterface } from "node:readline";
import {
  addUsage,
  emptyUsage,
  inputTokenCount,
  totalTokenCount,
} from "./claude-logs.mjs";

const RAW_USAGE_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_write_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

const RAW_USAGE_ALIASES = Object.freeze({
  input_tokens: ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"],
  cached_input_tokens: [
    "cached_input_tokens",
    "cachedInputTokens",
    "cache_read_input_tokens",
    "cacheReadInputTokens",
  ],
  cache_write_input_tokens: ["cache_write_input_tokens", "cacheWriteInputTokens"],
  output_tokens: ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"],
  reasoning_output_tokens: ["reasoning_output_tokens", "reasoningOutputTokens"],
  total_tokens: ["total_tokens", "totalTokens"],
});

function tokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function rawUsage(value) {
  if (!value || typeof value !== "object") return null;
  const usage = Object.fromEntries(
    RAW_USAGE_KEYS.map((key) => [
      key,
      tokenCount(RAW_USAGE_ALIASES[key].map((alias) => value[alias]).find((entry) => entry != null)),
    ]),
  );
  return RAW_USAGE_KEYS.some((key) => usage[key] > 0) ? usage : null;
}

function usageDelta(previous, current) {
  if (!previous) return current;
  const reset = RAW_USAGE_KEYS.some((key) => current[key] < previous[key]);
  if (reset) return current;
  return Object.fromEntries(
    RAW_USAGE_KEYS.map((key) => [key, current[key] - previous[key]]),
  );
}

export function normalizeCodexUsage(value) {
  const usage = rawUsage(value);
  if (!usage) return null;
  const cached = usage.cached_input_tokens;
  const cacheWrite = usage.cache_write_input_tokens;
  return {
    input_tokens: Math.max(0, usage.input_tokens - cached - cacheWrite),
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: cached,
    cache_write_5m_input_tokens: cacheWrite,
    cache_write_1h_input_tokens: 0,
  };
}

async function collectRolloutFiles(root, state, cursor = root) {
  let entries;
  try {
    entries = await readdir(cursor, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") state.unreadable_directories += 1;
    return;
  }

  for (const entry of entries) {
    const filePath = join(cursor, entry.name);
    if (entry.isDirectory()) {
      await collectRolloutFiles(root, state, filePath);
    } else if (
      entry.isFile() &&
      entry.name.startsWith("rollout-") &&
      entry.name.endsWith(".jsonl")
    ) {
      state.files.push({ filePath, root });
    }
  }
}

function timestampOf(record) {
  const timestamp = Date.parse(
    record.timestamp || record.created_at || record.createdAt || record.payload?.timestamp ||
      record.payload?.created_at || record.payload?.createdAt || "",
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}

function inWindow(timestamp, options) {
  return timestamp !== null && timestamp >= options.since && timestamp <= options.until;
}

function sessionIdOf(record, fallback) {
  return record.payload?.id || record.payload?.session_id || record.payload?.sessionId ||
    record.session_id || record.sessionId || fallback;
}

function modelOf(value) {
  return value?.model || value?.model_id || value?.modelId || value?.model_name ||
    value?.modelName || null;
}

function cumulativeUsageOf(record) {
  const info = record.payload?.info;
  return rawUsage(
    info?.total_token_usage || info?.totalTokenUsage || record.payload?.total_token_usage ||
      record.payload?.totalTokenUsage || record.payload?.usage || record.usage,
  );
}

function contentType(payload) {
  const type = String(payload?.type || "");
  if (type.endsWith("_call") || type === "web_search_call") return "tool_use";
  if (type === "agent_message" || (type === "message" && payload?.role === "assistant")) {
    return "text";
  }
  return null;
}

function failureSignal(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return false;
  if (typeof value === "string") {
    return /\b(?:error|failed|failure|timed out|timeout|exit code [1-9]\d*)\b/i.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => failureSignal(entry, depth + 1));
  if (typeof value !== "object") return false;
  if (value.is_error === true || value.success === false || value.ok === false) return true;
  if (["error", "failed", "failure"].includes(String(value.status || "").toLowerCase())) {
    return true;
  }
  return Object.entries(value).some(
    ([key, entry]) =>
      ["error", "message", "output", "text", "detail"].includes(key) &&
      failureSignal(entry, depth + 1),
  );
}

function isFailureRecord(record) {
  if (record.type === "event_msg" && record.payload?.type === "turn_aborted") return true;
  if (record.type !== "response_item") return false;
  const payload = record.payload || {};
  if (failureSignal({
    error: payload.error,
    is_error: payload.is_error,
    status: payload.status,
    output: payload.output,
  })) {
    return true;
  }
  return false;
}

function turnState(state, key, sessionId, model, timestamp) {
  if (!state.turns.has(key)) {
    state.turns.set(key, {
      id: key,
      session_id: sessionId,
      timestamp,
      model: model || "unknown",
      usage: emptyUsage(),
      reasoning_output_tokens: 0,
      content_types: new Set(),
      tool_names: new Set(),
      error_count: 0,
      retry_count: 0,
    });
  }
  const turn = state.turns.get(key);
  if (turn.model === "unknown" && model) turn.model = model;
  if (timestamp !== null) {
    turn.timestamp = turn.timestamp === null ? timestamp : Math.min(turn.timestamp, timestamp);
  }
  return turn;
}

function finalizeTurn(turn) {
  const contentTypes = [...turn.content_types];
  return {
    ...turn,
    content_types: contentTypes,
    tool_names: [...turn.tool_names],
    input_tokens: inputTokenCount(turn.usage),
    total_tokens: totalTokenCount(turn.usage),
    only_tool_calls:
      contentTypes.includes("tool_use") && !contentTypes.includes("text"),
  };
}

async function parseFile(file, options, state) {
  const fallbackSession = `${basename(file.root)}:${relative(file.root, file.filePath)}`;
  let activeModel = "unknown";
  let activeTurnId = null;
  let sessionId = fallbackSession;
  let forkedSession = false;
  let hasTurnContext = false;
  let previousCumulative = null;
  let lineNumber = 0;
  let input;
  const unattributedTurns = new Set();
  const unattributedRetries = new Set();
  const getTurn = (key, timestamp) => {
    const turn = turnState(state, key, sessionId, activeModel, timestamp);
    if (turn.model === "unknown") unattributedTurns.add(key);
    return turn;
  };

  try {
    input = createReadStream(file.filePath, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        state.malformed_lines += 1;
        state.lines_skipped += 1;
        continue;
      }
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        state.lines_skipped += 1;
        continue;
      }

      const timestamp = timestampOf(record);
      if (record.type === "session_meta") {
        sessionId = sessionIdOf(record, fallbackSession);
        forkedSession = Boolean(record.payload?.forked_from_id);
        const sessionModel = modelOf(record.payload);
        if (typeof sessionModel === "string") activeModel = sessionModel;
        state.lines_parsed += 1;
        continue;
      }
      if (record.type === "turn_context") {
        hasTurnContext = true;
        activeTurnId = record.payload?.turn_id || `${sessionId}:turn:${lineNumber}`;
        const turnModel = modelOf(record.payload);
        if (typeof turnModel === "string") {
          activeModel = turnModel;
          for (const key of unattributedTurns) {
            const turn = state.turns.get(key);
            if (turn?.model === "unknown") turn.model = activeModel;
          }
          for (const key of unattributedRetries) {
            const retry = state.retries.get(key);
            if (retry?.model === "unknown") retry.model = activeModel;
          }
          unattributedTurns.clear();
          unattributedRetries.clear();
        }
        state.lines_parsed += 1;
        continue;
      }

      // Fork rollouts replay their parent's records before the child's first
      // turn_context. Advance the cumulative baseline, but do not count or
      // inspect that inherited history again.
      if (forkedSession && !hasTurnContext) {
        if (record.type === "event_msg" && record.payload?.type === "token_count") {
          const inherited = cumulativeUsageOf(record);
          if (inherited) {
            previousCumulative = inherited;
            state.inherited_snapshots_skipped += 1;
          }
        }
        state.lines_skipped += 1;
        continue;
      }

      const turnKey = `${sessionId}:${activeTurnId || `line:${lineNumber}`}`;
      const type = record.type === "response_item" ? contentType(record.payload) : null;
      let parsed = false;
      if (type && inWindow(timestamp, options)) {
        const turn = getTurn(turnKey, timestamp);
        turn.content_types.add(type);
        if (type === "tool_use" && record.payload?.name) {
          turn.tool_names.add(record.payload.name);
        }
        parsed = true;
      }

      if (isFailureRecord(record) && inWindow(timestamp, options)) {
        const retryKey = record.payload?.call_id || record.payload?.id || `${turnKey}:${lineNumber}`;
        if (!state.retries.has(retryKey)) {
          state.retries.set(retryKey, {
            session_id: sessionId,
            timestamp,
            retry_attempt: 1,
            max_retries: 0,
            status: record.payload?.status || "error",
            model: activeModel,
            usage: null,
          });
          if (activeModel === "unknown") unattributedRetries.add(retryKey);
          const turn = getTurn(turnKey, timestamp);
          turn.error_count += 1;
          turn.retry_count += 1;
        }
        parsed = true;
      }

      if (record.type !== "event_msg" || record.payload?.type !== "token_count") {
        state[parsed ? "lines_parsed" : "lines_skipped"] += 1;
        continue;
      }
      const cumulative = cumulativeUsageOf(record);
      if (!cumulative) {
        state[parsed ? "lines_parsed" : "lines_skipped"] += 1;
        continue;
      }
      const delta = usageDelta(previousCumulative, cumulative);
      previousCumulative = cumulative;
      if (!inWindow(timestamp, options)) {
        state.lines_skipped += 1;
        continue;
      }
      const snapshotKey = `${sessionId}\0${RAW_USAGE_KEYS.map((key) => cumulative[key]).join(":")}`;
      if (state.snapshots.has(snapshotKey)) {
        state.duplicate_snapshots += 1;
        state.lines_skipped += 1;
        continue;
      }
      state.snapshots.add(snapshotKey);

      const usage = normalizeCodexUsage(delta);
      if (!usage || totalTokenCount(usage) === 0) {
        state.lines_skipped += 1;
        continue;
      }
      // A Codex turn can make several model requests. Keep every positive
      // cumulative delta separate so request-level pricing thresholds remain
      // correct; repeated snapshots produce a zero delta and no row.
      const usageTurnKey = `${turnKey}:usage:${lineNumber}`;
      const turn = getTurn(usageTurnKey, timestamp);
      const pending = state.turns.get(turnKey);
      if (pending && pending !== turn) {
        for (const content of pending.content_types) turn.content_types.add(content);
        for (const tool of pending.tool_names) turn.tool_names.add(tool);
        turn.error_count += pending.error_count;
        turn.retry_count += pending.retry_count;
        state.turns.delete(turnKey);
      }
      turn.usage = addUsage(turn.usage, usage);
      turn.reasoning_output_tokens += delta.reasoning_output_tokens;
      state.lines_parsed += 1;
    }
  } catch {
    state.unreadable_files += 1;
  } finally {
    input?.destroy();
  }
}

function sessionSummaries(turns) {
  const sessions = new Map();
  for (const turn of turns) {
    if (!sessions.has(turn.session_id)) {
      sessions.set(turn.session_id, {
        session_id: turn.session_id,
        models: new Set(),
        usage: emptyUsage(),
        started_at: turn.timestamp,
        ended_at: turn.timestamp,
        error_count: 0,
        retry_count: 0,
      });
    }
    const session = sessions.get(turn.session_id);
    session.models.add(turn.model);
    session.usage = addUsage(session.usage, turn.usage);
    session.started_at = Math.min(session.started_at, turn.timestamp);
    session.ended_at = Math.max(session.ended_at, turn.timestamp);
    session.error_count += turn.error_count;
    session.retry_count += turn.retry_count;
  }
  return [...sessions.values()].map((session) => ({
    ...session,
    model: session.models.size === 1 ? [...session.models][0] : "mixed",
    models: [...session.models],
    input_tokens: inputTokenCount(session.usage),
    total_tokens: totalTokenCount(session.usage),
  }));
}

export async function parseCodexLogs(options = {}) {
  const logRoots = options.logRoots ||
    (options.logRoot
      ? [options.logRoot]
      : [
          join(homedir(), ".codex", "sessions"),
          join(homedir(), ".codex", "archived_sessions"),
        ]);
  const until = options.until instanceof Date ? options.until.getTime() : options.until || Date.now();
  const since = options.since instanceof Date
    ? options.since.getTime()
    : options.since || until - 30 * 24 * 60 * 60 * 1_000;
  const discovery = { files: [], unreadable_directories: 0 };
  for (const root of logRoots) await collectRolloutFiles(root, discovery);

  const state = {
    turns: new Map(),
    retries: new Map(),
    snapshots: new Set(),
    duplicate_snapshots: 0,
    inherited_snapshots_skipped: 0,
    malformed_lines: 0,
    unreadable_files: 0,
    lines_parsed: 0,
    lines_skipped: 0,
  };
  for (const file of discovery.files.sort((left, right) =>
    left.filePath.localeCompare(right.filePath))) {
    await parseFile(file, { since, until }, state);
  }
  const turns = [...state.turns.values()]
    .filter((turn) => totalTokenCount(turn.usage) > 0 || turn.error_count > 0)
    .map(finalizeTurn)
    .sort((left, right) => left.timestamp - right.timestamp);

  return {
    turns,
    retries: [...state.retries.values()].sort((left, right) => left.timestamp - right.timestamp),
    sessions: sessionSummaries(turns),
    diagnostics: {
      files_scanned: discovery.files.length,
      files_found: discovery.files.length,
      directories_checked: logRoots,
      lines_parsed: state.lines_parsed,
      lines_skipped: state.lines_skipped,
      malformed_lines: state.malformed_lines,
      unreadable_files: state.unreadable_files,
      unreadable_directories: discovery.unreadable_directories,
      duplicate_snapshots: state.duplicate_snapshots,
      inherited_snapshots_skipped: state.inherited_snapshots_skipped,
    },
  };
}

export const internals = {
  failureSignal,
  rawUsage,
  usageDelta,
};
