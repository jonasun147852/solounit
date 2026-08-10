import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { renderDashboard, runDashboard } from "../src/dashboard.mjs";

const rawSecret = ["sk", "-ant-", "dashboard", "Fixture", "123456"].join("");

function syntheticReport() {
  return {
    generated_at: "2026-08-09T12:00:00.000Z",
    privacy: "local-only",
    doctor: {
      summary: { advisories_scanned: 2, matched: 1 },
      advisories: [
        {
          id: "TEST-ADVISORY-1",
          severity: "critical",
          summary: "Synthetic local advisory.",
          fix_steps: ["Apply the synthetic fix."],
        },
      ],
    },
    wallet: {
      window: { days: 30 },
      summary: { total_spend_usd: 42.75, estimated_potential_waste_usd: 7.5 },
      spend_by_model: [
        { model: "claude-fixture", priced: true, spend_usd: 40.25 },
        { model: "claude-small-fixture", priced: true, spend_usd: 2.5 },
      ],
      waste_buckets: [
        { key: "retry_storms", label: "Retry storms (estimate)", estimated_usd: 4.5 },
        { key: "context_bloat", label: "Context bloat (estimate)", estimated_usd: 2 },
        { key: "tier_mismatch", label: "Tier mismatch (estimate)", estimated_usd: 1 },
      ],
    },
    audit: {
      summary: { critical: 1, warning: 2, info: 3, total: 6 },
      findings: [
        {
          severity: "critical",
          id: "credential.plaintext",
          what: `Synthetic credential ${rawSecret}`,
          where: "~/.env:4 — sk-ant… (length 34)",
          fix: "Move it to a local credential store.",
        },
        {
          severity: "warning",
          id: "permission.broad",
          what: "A broad permission is configured.",
          where: "~/.claude/settings.json",
          fix: "Narrow the permission.",
        },
      ],
    },
    cognition: null,
  };
}

test("dashboard fixture renders all mirrors locally with masking and key numbers preserved", () => {
  const html = renderDashboard(syntheticReport());

  assert.match(html, /<html lang="en">/);
  assert.match(html, />Doctor</);
  assert.match(html, />Wallet</);
  assert.match(html, />Audit</);
  assert.match(html, />Cognition</);
  assert.match(html, /Coming soon/);
  assert.match(html, /1 matched/);
  assert.match(html, /\$42\.75/);
  assert.match(html, />1<\/span><small>Critical/);
  assert.match(html, />2<\/span><small>Warning/);
  assert.match(html, />3<\/span><small>Info/);
  assert.equal(html.includes(rawSecret), false, "dashboard leaked the audit fixture secret");
  assert.equal((html.match(/http:\/\//gi) || []).length, 0);
  assert.equal((html.match(/https:\/\//gi) || []).length, 0);
  assert.equal((html.match(/\/\/cdn/gi) || []).length, 0);
  assert.equal((html.match(/fetch\s*\(/gi) || []).length, 0);
  assert.equal((html.match(/<link\b/gi) || []).length, 0);
  assert.equal((html.match(/<script\b/gi) || []).length, 0);
});

test("runDashboard writes the default private file and opens it without a shell", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-dashboard-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const calls = [];
  const output = {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
  const destination = join(homeDirectory, ".oneco", "dashboard.html");

  await runDashboard({
    report: syntheticReport(),
    homeDirectory,
    open: true,
    platform: "darwin",
    execFile(command, args, callback) {
      calls.push({ command, args });
      callback(null);
    },
    output,
  });

  assert.deepEqual(calls, [{ command: "open", args: [destination] }]);
  assert.equal(
    output.value,
    `Dashboard written to ${destination}\nOpened ${destination}\n`,
  );
  assert.match(await readFile(destination, "utf8"), /oneco — local health panel/);
});
