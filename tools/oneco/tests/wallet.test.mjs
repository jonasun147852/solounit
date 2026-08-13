import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseClaudeLogs } from "../src/claude-logs.mjs";
import { parseCodexLogs } from "../src/codex-logs.mjs";
import {
  createWalletReport,
  detectRetryStorms,
  loadPricing,
  modelPrice,
  priceUsage,
  renderWallet,
  renderWalletHtml,
} from "../src/wallet.mjs";

const fixtureRoot = fileURLToPath(new URL("./fixtures", import.meta.url));
const codexFixtureRoot = fileURLToPath(new URL("./fixtures-codex", import.meta.url));
const codexForkFixtureRoot = fileURLToPath(new URL("./fixtures-codex-fork", import.meta.url));
const now = new Date("2026-08-09T12:00:00.000Z");

test("token pricing includes base input, both cache writes, cache reads, and output", async () => {
  const pricing = await loadPricing();
  const cost = priceUsage(
    {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_write_5m_input_tokens: 1_000_000,
      cache_write_1h_input_tokens: 1_000_000,
    },
    pricing.models["claude-fable-5"],
  );

  assert.equal(cost.priced, true);
  assert.equal(cost.input_side_usd, 43.5);
  assert.equal(cost.output_usd, 50);
  assert.equal(cost.total_usd, 93.5);
});

test("Codex pricing applies official cached and long-context rates", async () => {
  const pricing = await loadPricing();
  const cost = priceUsage(
    {
      input_tokens: 300_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 0,
      cache_write_5m_input_tokens: 0,
      cache_write_1h_input_tokens: 0,
    },
    pricing.models["gpt-5.6-terra"],
  );
  assert.equal(cost.total_usd, 3);
  assert.equal(cost.input_side_usd, 1.2);
  assert.equal(cost.output_usd, 1.8);
});

test("unknown models return unpriced tokens without throwing", () => {
  const cost = priceUsage(
    {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_write_5m_input_tokens: 0,
      cache_write_1h_input_tokens: 0,
    },
    null,
  );
  assert.deepEqual(cost, {
    priced: false,
    total_usd: 0,
    input_side_usd: 0,
    output_usd: 0,
    unpriced_tokens: 150,
  });
});

test("model aliases match dated snapshots but not distinct model families", async () => {
  const pricing = await loadPricing();
  assert.equal(modelPrice("gpt-5.4-private", pricing), null);
  assert.equal(
    modelPrice("gpt-5.4-2026-03-05", pricing),
    pricing.models["gpt-5.4"],
  );
  assert.equal(
    modelPrice("gpt-5.4-mini", pricing),
    pricing.models["gpt-5.4-mini"],
  );
});

test("Codex cumulative snapshots are differenced once and attributed to turn models", async () => {
  const logs = await parseCodexLogs({
    logRoot: codexFixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });

  assert.equal(logs.diagnostics.files_scanned, 1);
  assert.equal(logs.diagnostics.malformed_lines, 1);
  assert.equal(logs.turns.length, 2);
  assert.equal(logs.retries.length, 1);
  assert.equal(logs.sessions.length, 1);
  const priced = logs.turns.find((turn) => turn.model === "gpt-5.4");
  const unknown = logs.turns.find((turn) => turn.model === "fixture-unknown-codex");
  assert.deepEqual(priced.usage, {
    input_tokens: 80,
    output_tokens: 10,
    cache_read_input_tokens: 20,
    cache_write_5m_input_tokens: 0,
    cache_write_1h_input_tokens: 0,
  });
  assert.equal(unknown.total_tokens, 170);
  assert.equal(unknown.error_count, 1);
  assert.equal(logs.sessions[0].total_tokens, 280);
});

test("Codex fork rollouts exclude inherited parent snapshots", async () => {
  const logs = await parseCodexLogs({
    logRoot: codexForkFixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });
  assert.equal(logs.turns.length, 1);
  assert.equal(logs.turns[0].model, "gpt-5.4");
  assert.equal(logs.turns[0].total_tokens, 60);
  assert.equal(logs.retries.length, 0);
  assert.equal(logs.diagnostics.inherited_snapshots_skipped, 1);
});

test("Codex camel-case usage variants are priced without aborting on unusable lines", async (t) => {
  const logRoot = await mkdtemp(join(tmpdir(), "oneco-codex-schema-"));
  t.after(() => rm(logRoot, { recursive: true, force: true }));
  const records = [
    "null",
    JSON.stringify({
      type: "session_meta",
      payload: { id: "codex-schema", modelName: "gpt-5.4" },
    }),
    JSON.stringify({
      type: "turn_context",
      payload: { turn_id: "turn-1", modelId: "gpt-5.4" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-08-08T12:00:00.000Z",
      payload: {
        type: "token_count",
        info: {
          totalTokenUsage: {
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 10,
            totalTokens: 110,
          },
        },
      },
    }),
  ];
  await writeFile(join(logRoot, "rollout-schema.jsonl"), `${records.join("\n")}\n`);

  const logs = await parseCodexLogs({
    logRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });

  assert.equal(logs.turns.length, 1);
  assert.equal(logs.turns[0].model, "gpt-5.4");
  assert.equal(logs.turns[0].usage.input_tokens, 80);
  assert.equal(logs.turns[0].usage.cache_read_input_tokens, 20);
  assert.equal(logs.turns[0].usage.output_tokens, 10);
  assert.equal(logs.diagnostics.lines_parsed, 3);
  assert.equal(logs.diagnostics.lines_skipped, 1);
});

test("multi-agent wallet groups agents and keeps unknown Codex models unpriced", async () => {
  const pricing = await loadPricing();
  const claude = await parseClaudeLogs({
    logRoot: fixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });
  const codex = await parseCodexLogs({
    logRoot: codexFixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });
  const report = await createWalletReport({
    logsByAgent: { claude, codex },
    pricing,
    now,
    days: 30,
  });

  assert.deepEqual(report.by_agent.map((agent) => agent.agent), ["claude", "codex"]);
  assert.equal(
    report.summary.total_spend_usd,
    Number((report.by_agent[0].summary.total_spend_usd +
      report.by_agent[1].summary.total_spend_usd).toFixed(6)),
  );
  assert.equal(report.by_agent[1].summary.unpriced_tokens, 170);
  assert.ok(report.spend_by_model.every((row) => row.agent));
  const terminal = renderWallet(report);
  assert.match(terminal, /Combined API-equivalent usage/);
  assert.match(terminal, /^Claude Code$/m);
  assert.match(terminal, /^Codex$/m);
  assert.doesNotMatch(terminal, /[\u3400-\u9fff]/u);
});

test("wallet auto-detects both local log layouts without network access", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-wallet-sources-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const claudeRoot = join(homeDirectory, ".claude", "projects", "fixture");
  const codexRoot = join(homeDirectory, ".codex", "sessions", "2026", "08", "09");
  await mkdir(claudeRoot, { recursive: true });
  await mkdir(codexRoot, { recursive: true });
  await cp(join(fixtureRoot, "wallet-session.jsonl"), join(claudeRoot, "session.jsonl"));
  await cp(
    join(codexFixtureRoot, "rollout-cumulative.jsonl"),
    join(codexRoot, "rollout-fixture.jsonl"),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("wallet attempted a network call");
  };
  try {
    const report = await createWalletReport({ homeDirectory, now, days: 30 });
    assert.deepEqual(report.by_agent.map((agent) => agent.agent), ["claude", "codex"]);
    assert.equal(report.privacy, "local-only");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet names checked paths and files when logs contain no priced turns", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-wallet-unpriced-empty-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const claudeRoot = join(homeDirectory, ".claude", "projects", "fixture");
  await mkdir(claudeRoot, { recursive: true });
  await writeFile(
    join(claudeRoot, "session.jsonl"),
    `${JSON.stringify({
      type: "assistant",
      timestamp: "2026-08-08T12:00:00.000Z",
      message: { role: "assistant", model: "claude-sonnet-5" },
    })}\n`,
  );

  const report = await createWalletReport({ homeDirectory, now, days: 30 });
  const terminal = renderWallet(report);

  assert.equal(report.summary.sessions, 0);
  assert.equal(report.summary.priced_turns, 0);
  assert.equal(report.diagnostics.files_found, 1);
  assert.match(terminal, new RegExp(`Checked these paths: ${homeDirectory.replaceAll("/", "\\/")}.*\\.claude\\/projects`));
  assert.match(terminal, /Saw 1 session log file\(s\), but parsed zero priced turns\./);
});

test("fixture parsing deduplicates split messages and tolerates malformed JSONL", async () => {
  const logs = await parseClaudeLogs({
    logRoot: fixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });

  assert.equal(logs.turns.length, 3);
  assert.equal(logs.retries.length, 2);
  assert.equal(logs.diagnostics.files_scanned, 1);
  assert.equal(logs.diagnostics.malformed_lines, 1);
  const splitTurn = logs.turns.find((turn) => turn.id === "fixture-message-1");
  assert.deepEqual(splitTurn.content_types.sort(), ["thinking", "tool_use"]);
  assert.equal(splitTurn.usage.input_tokens, 1_000_000);
});

test("Claude schema variants skip unusable lines and continue to later priced turns", async (t) => {
  const logRoot = await mkdtemp(join(tmpdir(), "oneco-wallet-schema-"));
  t.after(() => rm(logRoot, { recursive: true, force: true }));
  const logPath = join(logRoot, "schema-variants.jsonl");
  const lines = [
    "not-json",
    "null",
    JSON.stringify({
      type: "assistant_message",
      role: "assistant",
      createdAt: "2026-08-08T12:00:00.000Z",
      session_id: "missing-usage",
      modelId: "claude-sonnet-5",
    }),
    JSON.stringify({
      type: "assistant_message",
      role: "assistant",
      createdAt: "2026-08-08T12:01:00.000Z",
      session_id: "schema-variant",
      modelId: "claude-sonnet-5",
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cachedInputTokens: 30,
      },
    }),
  ];
  await writeFile(logPath, `${lines.join("\n")}\n`);

  const logs = await parseClaudeLogs({
    logRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });

  assert.equal(logs.turns.length, 1);
  assert.equal(logs.turns[0].model, "claude-sonnet-5");
  assert.equal(logs.turns[0].session_id, "schema-variant");
  assert.equal(logs.turns[0].usage.input_tokens, 100);
  assert.equal(logs.turns[0].usage.cache_read_input_tokens, 30);
  assert.equal(logs.diagnostics.files_found, 1);
  assert.equal(logs.diagnostics.lines_parsed, 1);
  assert.equal(logs.diagnostics.lines_skipped, 3);
});

test("wallet math prices fixture usage and retry storms exactly", async () => {
  const pricing = await loadPricing();
  const logs = await parseClaudeLogs({
    logRoot: fixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });
  const storms = detectRetryStorms(logs.retries, logs.turns, pricing);
  assert.equal(storms.storms.length, 1);
  assert.equal(storms.attempts, 2);
  assert.equal(storms.estimated_usd, 0.4);

  const report = await createWalletReport({ logs, pricing, now, days: 30 });
  assert.equal(report.summary.assistant_turns, 3);
  assert.equal(report.summary.total_spend_usd, 4.8);
  assert.equal(report.summary.unpriced_tokens, 110);
  assert.equal(report.framing.usage_label, "API-equivalent usage");
  assert.match(report.framing.usage_explainer, /not your bill/);
  assert.equal(report.framing.savings_label, "Potential savings if optimized");
  assert.equal(report.spend_by_model[0].model, "claude-sonnet-5");
  assert.equal(
    report.waste_buckets.find((bucket) => bucket.key === "retry_storms").estimated_usd,
    0.4,
  );

  const terminal = renderWallet(report);
  assert.match(terminal, /API-equivalent usage: \$4\.80\./);
  assert.match(terminal, /this is what your plan absorbed, not your bill\./);
  assert.match(terminal, /Potential savings if optimized/);
  assert.doesNotMatch(terminal, /Estimated priced spend/);
});

test("wallet HTML renders a private, self-contained card from the fixture report", async () => {
  const pricing = await loadPricing();
  const logs = await parseClaudeLogs({
    logRoot: fixtureRoot,
    since: new Date("2026-08-01T00:00:00.000Z"),
    until: now,
  });
  const report = await createWalletReport({ logs, pricing, now, days: 30 });
  const html = renderWalletHtml(report);

  assert.match(html, /API-equivalent usage/);
  assert.match(html, /\$4\.80/);
  assert.match(html, /claude-sonnet-5/);
  assert.match(html, /Retry storms \(estimate\)/);
  assert.match(html, /Potential savings if optimized/);
  assert.equal(html.match(/class="waste-card"/g)?.length, 3);
  assert.match(html, /generated locally by SoloUnit — nothing left this machine/);
  assert.doesNotMatch(html, /http/i);
});
