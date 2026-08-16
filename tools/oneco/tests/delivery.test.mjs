import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "../bin/oneco.mjs";
import {
  createDeliveryReport,
  internals,
  renderDelivery,
  sessionRef,
} from "../src/delivery.mjs";

const { assertsCompletion } = internals;

const NOW = new Date("2026-08-09T12:00:00.000Z");
const CLAUDE_ROOT = fileURLToPath(new URL("./fixtures-delivery/claude", import.meta.url));
const CODEX_ROOT = fileURLToPath(new URL("./fixtures-delivery/codex", import.meta.url));

function fixtureOptions(overrides = {}) {
  return {
    claudeLogRoot: CLAUDE_ROOT,
    codexLogRoots: [CODEX_ROOT],
    now: NOW,
    days: 30,
    ...overrides,
  };
}

function findingById(report, id) {
  return report.findings.find((entry) => entry.id === id);
}

function outputBuffer() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

test("commands are classified by runner and the displayed label is only the matched prefix", () => {
  const { classifyCommand } = internals;

  assert.deepEqual(classifyCommand("npm test -- --token=secret").checks, [
    { runner: "npm test", kind: "test" },
  ]);
  assert.deepEqual(classifyCommand("npx  vitest run src/").checks, [
    { runner: "vitest", kind: "test" },
  ]);
  assert.deepEqual(classifyCommand("CI=1 poetry run pytest -q").checks, [
    { runner: "pytest", kind: "test" },
  ]);
  assert.deepEqual(classifyCommand("npm run lint && tsc --noEmit").checks, [
    { runner: "npm run lint", kind: "lint" },
    { runner: "tsc", kind: "typecheck" },
  ]);
  assert.deepEqual(classifyCommand("git status").checks, []);
  assert.deepEqual(classifyCommand("cat notes-about-npm-test.md").checks, []);
});

test("verification suppression is detected in commands and in edited content", () => {
  const { classifyCommand, contentSuppressions } = internals;

  assert.deepEqual(classifyCommand("git commit --no-verify -m wip").suppressions, ["no-verify"]);
  assert.deepEqual(classifyCommand("git commit -n -m wip").suppressions, ["no-verify"]);
  assert.deepEqual(classifyCommand("npm test || true").suppressions, ["swallowed-failure"]);
  assert.deepEqual(classifyCommand("jest --passWithNoTests").suppressions, ["no-tests"]);
  // `|| true` only matters when it is swallowing a check.
  assert.deepEqual(classifyCommand("rm -f build.log || true").suppressions, []);

  assert.deepEqual(contentSuppressions('test.skip("router", () => {}'), ["skipped-test"]);
  assert.deepEqual(contentSuppressions("@pytest.mark.skip\ndef test_queue():"), ["skipped-test"]);
  assert.deepEqual(contentSuppressions('it.only("just this one", () => {}'), ["focused-test"]);
  // Removing a skip is the opposite of suppressing verification.
  assert.deepEqual(
    contentSuppressions('test("router", () => {}', 'test.skip("router", () => {}'),
    [],
  );
});

test("completion claims are matched in both locales without catching hedged prose", () => {
  for (const claim of [
    "All tests pass.",
    "The tests are now passing.",
    "I have fixed the cache module.",
    "Done. The router now applies strict defaults.",
    "This should now work.",
    "测试全部通过，可以提交了。",
    "已修复，重新跑了一遍。",
  ]) {
    assert.equal(assertsCompletion(claim), true, `expected a claim: ${claim}`);
  }

  for (const hedge of [
    "Let me run the tests and see whether they pass.",
    "The tests are still failing, so I will keep digging.",
    "I am not done yet — one case remains.",
    "接下来我会继续修，还没有完成。",
  ]) {
    assert.equal(assertsCompletion(hedge), false, `expected no claim: ${hedge}`);
  }
});

test("the delivery report scores sessions and fires one finding per delivery risk", async () => {
  const report = await createDeliveryReport(fixtureOptions());

  assert.equal(report.mirror, "delivery");
  assert.equal(report.privacy, "local-only");
  assert.equal(report.summary.sessions, 5);
  assert.equal(report.summary.sessions_with_edits, 5);
  assert.equal(report.summary.verified_sessions, 3);
  assert.equal(report.summary.trust_score, 60);
  assert.equal(report.summary.edits, 6);
  assert.equal(report.summary.checks_run, 4);
  assert.equal(report.summary.checks_failed, 1);
  assert.equal(report.summary.claims, 4);

  assert.equal(report.summary.critical, 2);
  assert.equal(report.summary.warning, 2);
  assert.equal(report.summary.info, 1);

  assert.deepEqual(
    findingById(report, "delivery.claim_after_failed_check").sessions,
    [sessionRef("delivery-claim-after-failure")],
  );
  assert.deepEqual(
    findingById(report, "delivery.edits_never_checked").sessions,
    [sessionRef("delivery-never-checked")],
  );
  assert.deepEqual(
    findingById(report, "delivery.unresolved_failure").sessions,
    [sessionRef("delivery-claim-after-failure")],
  );
  assert.deepEqual(
    findingById(report, "delivery.verification_suppressed").sessions,
    [sessionRef("delivery-suppressed")],
  );
  assert.match(
    findingById(report, "delivery.verification_suppressed").why,
    /hook bypass \(--no-verify\).*test skipped or ignored/,
  );
  assert.equal(findingById(report, "delivery.verified").session_count, 3);
  assert.equal(findingById(report, "delivery.stale_verification"), undefined);

  assert.deepEqual(report.checks_by_runner, [
    { runner: "npm test", kind: "test", runs: 3, passed: 2, failed: 1 },
    { runner: "pytest", kind: "test", runs: 1, passed: 1, failed: 0 },
  ]);
});

test("a Codex rollout contributes an apply_patch edit verified by a passing shell check", async () => {
  const report = await createDeliveryReport(fixtureOptions({ agent: "codex" }));

  assert.equal(report.summary.sessions, 1);
  assert.equal(report.summary.trust_score, 100);
  assert.deepEqual(report.by_agent.map((entry) => entry.agent), ["codex"]);
  assert.deepEqual(report.sessions[0].checks, [
    { runner: "pytest", kind: "test", passed: true },
  ]);
  assert.equal(report.sessions[0].claims, 1);
});

test("the report never carries a command line, a session id, or transcript text", async () => {
  const report = await createDeliveryReport(fixtureOptions());
  const serialized = `${JSON.stringify(report)}\n${renderDelivery(report, "en")}`;

  assert.equal(serialized.includes("fixture-secret-must-not-print"), false);
  assert.equal(serialized.includes("--reporter=dot"), false);
  assert.equal(serialized.includes("delivery-claim-after-failure"), false);
  assert.equal(serialized.includes("codex-delivery-session"), false);
  assert.equal(serialized.includes("The router now applies strict defaults"), false);
  assert.equal(serialized.includes("/repo/src/parser.mjs"), false);
  assert.match(serialized, new RegExp(sessionRef("delivery-never-checked")));
});

test("the trust score is null, not zero, when no session changed files", async () => {
  const report = await createDeliveryReport(fixtureOptions({
    scan: {
      sessions: [
        {
          id: "read-only-session",
          agent: "claude",
          events: [{ kind: "check", sequence: 1, runner: "npm test", check_kind: "test", passed: true }],
        },
      ],
      agents: [{ agent: "claude", label_key: "agent.claude" }],
      diagnostics: { directories_checked: [], files_found: 1, lines_parsed: 1, lines_skipped: 0 },
    },
  }));

  assert.equal(report.summary.trust_score, null);
  assert.equal(report.summary.sessions_with_edits, 0);
  assert.match(renderDelivery(report, "en"), /none of them changed files/);
});

test("an absent log directory reports the paths it checked instead of a blank section", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-delivery-empty-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));

  const report = await createDeliveryReport({ homeDirectory, now: NOW });
  const rendered = renderDelivery(report, "en");

  assert.equal(report.summary.sessions, 0);
  assert.equal(report.summary.trust_score, null);
  assert.match(rendered, /Checked these paths: .*\.claude\/projects.*\.codex\/sessions/);
  assert.match(rendered, /Found no session logs there\./);
  assert.doesNotMatch(rendered, /[㐀-鿿]/u);
});

test("the delivery command renders locally and serializes to JSON", async () => {
  const text = outputBuffer();
  const json = outputBuffer();

  assert.equal(
    await main(["delivery", "--days", "30"], {
      output: text,
      deliveryOptions: fixtureOptions(),
    }),
    0,
  );
  assert.equal(
    await main(["delivery", "--json"], { output: json, deliveryOptions: fixtureOptions() }),
    0,
  );

  assert.match(text.value, /^Delivery$/m);
  assert.match(text.value, /Delivery trust score: 60%/);
  assert.match(text.value, /\[delivery\.claim_after_failed_check\]/);
  assert.match(text.value, /npm test: 3 run\(s\) — 2 passed, 1 failed/);
  assert.doesNotMatch(text.value, /[㐀-鿿]/u);
  assert.equal(JSON.parse(json.value).mirror, "delivery");
});

test("graft renders the delivery mirror and keeps going when it fails", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-graft-delivery-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();

  const exitCode = await main(["graft", "--lang", "zh"], {
    output,
    doctorOptions: {
      fingerprint: {
        claude: { present: true, version: "2.1.201" },
        node: { version: "26.0.0" },
        os: { platform: "darwin", arch: "arm64", release: "test" },
        dimensions: [],
        scan_errors: [],
      },
      advisories: [],
      now: NOW,
    },
    walletOptions: { homeDirectory, now: NOW },
    auditOptions: { homeDirectory, now: NOW },
    deliveryOptions: fixtureOptions(),
  });

  assert.equal(exitCode, 0);
  assert.match(output.value, /交付镜 · Delivery/);
  assert.match(output.value, /交付信任分：60%/);
});
