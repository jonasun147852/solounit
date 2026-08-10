import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseClaudeLogs } from "../src/claude-logs.mjs";
import {
  createWalletReport,
  detectRetryStorms,
  loadPricing,
  priceUsage,
  renderWallet,
  renderWalletHtml,
} from "../src/wallet.mjs";

const fixtureRoot = fileURLToPath(new URL("./fixtures", import.meta.url));
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
