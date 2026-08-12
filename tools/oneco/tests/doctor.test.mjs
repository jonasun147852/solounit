import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  advisoryMatches,
  createDoctorReport,
  loadAdvisories,
  matchAdvisories,
  satisfiesVersion,
} from "../src/doctor.mjs";
import { writeAdvisoryCache } from "../src/advisory-cache.mjs";

function fingerprint(overrides = {}) {
  return {
    claude: { present: true, version: "2.1.201" },
    node: { version: "26.0.0" },
    os: { platform: "darwin", arch: "arm64", release: "test" },
    package_managers: [{ name: "npm" }],
    mcp_servers: [{ name: "tradingview" }],
    plugins: [{ name: "feature-dev@claude-plugins-official" }],
    dimensions: [
      "arch:arm64",
      "claude:2.1.201",
      "mcp:tradingview",
      "node:26.0.0",
      "os:darwin",
      "package-manager:npm",
      "plugin:feature-dev@claude-plugins-official",
    ],
    scan_errors: [],
    ...overrides,
  };
}

function advisory(affected, dimensions = []) {
  return {
    id: "TEST-1",
    affected,
    fingerprint_dims: dimensions,
  };
}

test("semver ranges support comparisons, wildcards, unions, caret, tilde, and hyphens", () => {
  assert.equal(satisfiesVersion("2.1.201", ">=2.1.197 <2.2.0"), true);
  assert.equal(satisfiesVersion("2.2.0", ">=2.1.197 <2.2.0"), false);
  assert.equal(satisfiesVersion("2.1.201", "2.1.x"), true);
  assert.equal(satisfiesVersion("3.0.0", "2.x || 3.x"), true);
  assert.equal(satisfiesVersion("2.4.0", "^2.1.0"), true);
  assert.equal(satisfiesVersion("2.2.0", "~2.1.0"), false);
  assert.equal(satisfiesVersion("2.1.9", "2.1.0 - 2.1.9"), true);
  assert.equal(satisfiesVersion("not-a-version", ">=2.0.0"), false);
  assert.equal(satisfiesVersion(null, "*"), true);
});

test("doctor requires the affected installation, version range, and every dimension", () => {
  const candidate = advisory(
    { name: "claude-code", versions: ">=2.1.0 <2.2.0" },
    ["claude:*", "os:darwin"],
  );
  assert.equal(advisoryMatches(fingerprint(), candidate), true);
  assert.equal(
    advisoryMatches(
      fingerprint({
        dimensions: ["claude:2.1.201", "os:linux"],
      }),
      candidate,
    ),
    false,
  );
  assert.equal(
    advisoryMatches(
      fingerprint({ claude: { present: true, version: "2.2.0" } }),
      candidate,
    ),
    false,
  );
});

test("MCP wildcard advisories match installed names while versioned unknown installs stay silent", () => {
  const wildcard = advisory({ name: "tradingview", versions: "*" }, ["mcp:tradingview"]);
  const versioned = advisory({ name: "tradingview", versions: ">=1.0.0" }, [
    "mcp:tradingview",
  ]);
  const missing = advisory({ name: "missing-server", versions: "*" });

  assert.deepEqual(matchAdvisories(fingerprint(), [wildcard, versioned, missing]), [wildcard]);
});

test("doctor never proactively matches event-triggered advisories", () => {
  const environmentAdvisory = advisory(
    { name: "claude-code", versions: "*" },
    ["claude:*"],
  );
  const eventAdvisory = {
    ...environmentAdvisory,
    id: "EVENT-1",
    trigger: "event",
    match_signals: ["API Error: 529"],
  };

  assert.deepEqual(
    matchAdvisories(fingerprint(), [environmentAdvisory, eventAdvisory]),
    [environmentAdvisory],
  );
});

test("doctor merges the offline cache by ID and the cached version wins", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-doctor-"));
  const seedUrl = new URL("../src/advisories/seed.json", import.meta.url);
  const cachePath = join(homeDirectory, ".oneco", "advisories.json");
  const cached = {
    id: "ONECO-2026-0001",
    affected: { name: "claude-code", versions: "*" },
    error_class: "credential-refresh-retry-loop",
    fingerprint_dims: ["claude:*"],
    summary: "The synced advisory replaced the bundled version.",
    evidence: "Scrubbed cached evidence.",
    fix_steps: ["Use the synced fix."],
    source: "synced-source:1",
    published: "2026-08-09",
    status: "published",
  };
  try {
    await writeAdvisoryCache([cached], {
      path: cachePath,
      now: new Date("2026-08-09T12:00:00.000Z"),
    });
    const loaded = await loadAdvisories(seedUrl, { cachePath });
    const replacement = loaded.find((entry) => entry.id === cached.id);

    assert.equal(loaded.length, 4);
    assert.deepEqual(replacement, cached);
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("doctor loads both offline bundles but scans only environment-state advisories", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-doctor-empty-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("doctor attempted a network call");
  };
  try {
    const loaded = await loadAdvisories(undefined, { homeDirectory });
    const eventAdvisories = loaded.filter((entry) => entry.trigger === "event");
    assert.equal(loaded.length, 21);
    assert.equal(eventAdvisories.length, 17);
    assert.ok(eventAdvisories.every((entry) => entry.status === "draft"));

    const report = await createDoctorReport({
      fingerprint: fingerprint(),
      advisories: loaded,
      now: new Date("2026-08-12T12:00:00.000Z"),
    });
    assert.equal(report.summary.advisories_scanned, 4);
    const proactiveOutput = JSON.stringify(report);
    assert.ok(
      report.advisories.every((entry) => !eventAdvisories.some((draft) => draft.id === entry.id)),
    );
    for (const advisory of eventAdvisories) {
      assert.doesNotMatch(proactiveOutput, new RegExp(advisory.id));
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(homeDirectory, { recursive: true, force: true });
  }
});
