import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";

export function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_write_5m_input_tokens: 0,
    cache_write_1h_input_tokens: 0,
  };
}

function tokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  const cacheCreation = value.cache_creation || value.cacheCreation || {};
  const fiveMinute = tokenCount(
    cacheCreation.ephemeral_5m_input_tokens ?? value.cache_write_5m_input_tokens,
  );
  const oneHour = tokenCount(
    cacheCreation.ephemeral_1h_input_tokens ?? value.cache_write_1h_input_tokens,
  );
  const aggregateCacheWrite = tokenCount(
    value.cache_creation_input_tokens ?? value.cacheCreationInputTokens,
  );
  const knownCacheWrite = fiveMinute + oneHour;

  return {
    input_tokens: tokenCount(
      value.input_tokens ?? value.inputTokens ?? value.prompt_tokens ?? value.promptTokens,
    ),
    output_tokens: tokenCount(
      value.output_tokens ?? value.outputTokens ?? value.completion_tokens ??
        value.completionTokens,
    ),
    cache_read_input_tokens: tokenCount(
      value.cache_read_input_tokens ?? value.cacheReadInputTokens ??
        value.cached_input_tokens ?? value.cachedInputTokens,
    ),
    cache_write_5m_input_tokens:
      fiveMinute + (knownCacheWrite === 0 ? aggregateCacheWrite : 0),
    cache_write_1h_input_tokens: oneHour,
  };
}

export function mergeUsage(left, right) {
  const merged = emptyUsage();
  for (const key of Object.keys(merged)) {
    merged[key] = Math.max(left?.[key] || 0, right?.[key] || 0);
  }
  return merged;
}

export function addUsage(left, right) {
  const total = emptyUsage();
  for (const key of Object.keys(total)) {
    total[key] = (left?.[key] || 0) + (right?.[key] || 0);
  }
  return total;
}

export function inputTokenCount(usage) {
  return (
    usage.input_tokens +
    usage.cache_read_input_tokens +
    usage.cache_write_5m_input_tokens +
    usage.cache_write_1h_input_tokens
  );
}

export function totalTokenCount(usage) {
  return inputTokenCount(usage) + usage.output_tokens;
}

async function collectJsonlFiles(root, state, cursor = root) {
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
      await collectJsonlFiles(root, state, filePath);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      state.files.push(filePath);
    }
  }
}

function timestampOf(record) {
  const message = messageOf(record);
  const timestamp = Date.parse(
    record.timestamp || record.created_at || record.createdAt || message?.timestamp ||
      record.data?.timestamp || record.payload?.timestamp || "",
  );
  return Number.isFinite(timestamp) ? timestamp : null;
}

function inWindow(timestamp, since, until) {
  return timestamp !== null && timestamp >= since && timestamp <= until;
}

function messageOf(record) {
  const candidates = [
    record?.message,
    record?.data?.message,
    record?.payload?.message,
    record?.response?.message,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

function usageOf(record) {
  const message = messageOf(record);
  const candidates = [
    message?.usage,
    record?.usage,
    record?.data?.usage,
    record?.payload?.usage,
    record?.response?.usage,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

function sessionIdOf(record, fallback) {
  return record.sessionId || record.session_id || record.data?.sessionId ||
    record.data?.session_id || record.payload?.sessionId || record.payload?.session_id || fallback;
}

function modelOf(record) {
  const message = messageOf(record);
  return message?.model || record.model || record.model_id || record.modelId ||
    record.data?.model || record.payload?.model || "unknown";
}

function contentMetadata(record) {
  const content = messageOf(record)?.content;
  if (!Array.isArray(content)) {
    return {
      content_types: typeof content === "string" ? ["text"] : [],
      tool_names: [],
    };
  }

  return {
    content_types: content.map((block) => block?.type).filter(Boolean),
    tool_names: content
      .filter((block) => block?.type === "tool_use" && block.name)
      .map((block) => block.name),
  };
}

function isAssistantUsageRecord(record) {
  const role = messageOf(record)?.role || record.role || record.data?.role ||
    record.payload?.role;
  const type = String(record.type || record.data?.type || record.payload?.type || "")
    .toLowerCase();
  return (type === "assistant" || type === "assistant_message" || role === "assistant") &&
    usageOf(record);
}

function isRetryRecord(record) {
  const type = String(record.type || "").toLowerCase();
  const subtype = String(record.subtype || "").toLowerCase();
  return (
    subtype === "api_error" ||
    type === "api_error" ||
    type === "retry" ||
    subtype === "retry" ||
    subtype === "api_retry"
  );
}

function usageFromRetryRecord(record) {
  return normalizeUsage(
    record.usage || record.error?.usage || usageOf(record) || record.request?.usage,
  );
}

function mergeTurn(existing, record, usage, timestamp, fallbackSession) {
  const content = contentMetadata(record);
  const message = messageOf(record);
  if (!existing) {
    return {
      id: message?.id || record.requestId || record.request_id || record.uuid,
      session_id: sessionIdOf(record, fallbackSession),
      timestamp,
      model: modelOf(record),
      usage,
      content_types: new Set(content.content_types),
      tool_names: new Set(content.tool_names),
    };
  }

  existing.usage = mergeUsage(existing.usage, usage);
  existing.timestamp = Math.min(existing.timestamp, timestamp);
  for (const type of content.content_types) existing.content_types.add(type);
  for (const name of content.tool_names) existing.tool_names.add(name);
  return existing;
}

function finalizeTurn(turn) {
  const contentTypes = [...turn.content_types];
  return {
    ...turn,
    content_types: contentTypes,
    tool_names: [...turn.tool_names],
    input_tokens: inputTokenCount(turn.usage),
    only_tool_calls:
      contentTypes.includes("tool_use") &&
      !contentTypes.includes("text") &&
      !contentTypes.includes("fallback"),
  };
}

async function parseFile(filePath, root, options, state) {
  const fallbackSession = relative(root, filePath);
  let lineNumber = 0;
  let input;
  try {
    input = createReadStream(filePath, { encoding: "utf8" });
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
      if (!inWindow(timestamp, options.since, options.until)) {
        state.lines_skipped += 1;
        continue;
      }

      let parsed = false;

      if (isAssistantUsageRecord(record)) {
        const usage = normalizeUsage(usageOf(record));
        if (usage && totalTokenCount(usage) > 0) {
          const message = messageOf(record);
          const id = message?.id || record.requestId || record.request_id || record.uuid;
          const key = id ? `message:${id}` : `${fallbackSession}:${lineNumber}`;
          state.turns.set(
            key,
            mergeTurn(
              state.turns.get(key),
              record,
              usage,
              timestamp,
              fallbackSession,
            ),
          );
          parsed = true;
        }
      }

      if (isRetryRecord(record)) {
        const id = record.uuid || record.id;
        const key = id
          ? `retry:${id}`
          : `${sessionIdOf(record, fallbackSession)}:${timestamp}:${record.retryAttempt || lineNumber}`;
        if (!state.retries.has(key)) {
          state.retries.set(key, {
            session_id: sessionIdOf(record, fallbackSession),
            timestamp,
            retry_attempt: tokenCount(record.retryAttempt),
            max_retries: tokenCount(record.maxRetries),
            status: record.error?.status || record.status || null,
            model: modelOf(record),
            usage: usageFromRetryRecord(record),
          });
        }
        parsed = true;
      }

      state[parsed ? "lines_parsed" : "lines_skipped"] += 1;
    }
  } catch {
    state.unreadable_files += 1;
  } finally {
    input?.destroy();
  }
}

export async function parseClaudeLogs(options = {}) {
  const logRoot = options.logRoot || join(homedir(), ".claude", "projects");
  const until = options.until instanceof Date ? options.until.getTime() : options.until || Date.now();
  const since =
    options.since instanceof Date
      ? options.since.getTime()
      : options.since || until - 30 * 24 * 60 * 60 * 1_000;
  const discovery = { files: [], unreadable_directories: 0 };
  await collectJsonlFiles(logRoot, discovery);

  const state = {
    turns: new Map(),
    retries: new Map(),
    malformed_lines: 0,
    unreadable_files: 0,
    lines_parsed: 0,
    lines_skipped: 0,
  };
  const window = { since, until };
  for (const filePath of discovery.files.sort()) {
    await parseFile(filePath, logRoot, window, state);
  }

  return {
    turns: [...state.turns.values()].map(finalizeTurn),
    retries: [...state.retries.values()].sort((left, right) => left.timestamp - right.timestamp),
    diagnostics: {
      files_scanned: discovery.files.length,
      files_found: discovery.files.length,
      directories_checked: [logRoot],
      lines_parsed: state.lines_parsed,
      lines_skipped: state.lines_skipped,
      malformed_lines: state.malformed_lines,
      unreadable_files: state.unreadable_files,
      unreadable_directories: discovery.unreadable_directories,
    },
  };
}
