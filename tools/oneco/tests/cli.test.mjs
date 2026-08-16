import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "../bin/oneco.mjs";

function outputBuffer() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

const fingerprint = {
  claude: { present: true, version: "2.1.201" },
  node: { version: "26.0.0" },
  os: { platform: "darwin", arch: "arm64", release: "test" },
  package_managers: [],
  mcp_servers: [],
  plugins: [],
  dimensions: ["claude:2.1.201", "os:darwin"],
  scan_errors: [],
};

const pricing = {
  currency: "USD",
  published_as_of: "2026-08-09",
  source: "bundled-test-table",
  models: {
    "claude-test": {
      input: 1,
      output: 2,
      cache_read: 0.1,
      cache_write_5m: 1.25,
      cache_write_1h: 2,
      tier: 1,
    },
  },
};

test("the CLI runs through the solounit npm executable symlink", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "oneco-bin-symlink-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, "solounit");
  await symlink(fileURLToPath(new URL("../bin/oneco.mjs", import.meta.url)), executable);

  const result = spawnSync(executable, ["--help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SoloUnit — private mirrors/);
  assert.match(result.stdout, /Usage:\n  solounit doctor/);
});

test("graft runs all mirrors, includes the audit section, and prints the closing", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-graft-audit-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const errorOutput = outputBuffer();
  const exitCode = await main(["graft", "--days", "7"], {
    output,
    errorOutput,
    doctorOptions: {
      fingerprint,
      advisories: [],
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    walletOptions: {
      logs: {
        turns: [],
        retries: [],
        diagnostics: {
          files_scanned: 0,
          malformed_lines: 0,
          unreadable_files: 0,
          unreadable_directories: 0,
        },
      },
      pricing,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    auditOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    deliveryOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.match(output.value, /^Doctor$/m);
  assert.match(output.value, /^Wallet$/m);
  assert.match(output.value, /Audit — 0 critical, 0 warning, 0 info\. No findings\./);
  assert.ok(output.value.indexOf("Graft complete:") < output.value.lastIndexOf("Audit —"));
  assert.match(
    output.value,
    /Graft complete: Doctor matched 0 local setup advisories\. Wallet reports \$0\.00 in API-equivalent usage and up to \$0\.00 in potential savings if optimized;/,
  );
  assert.match(output.value, /Run `solounit dashboard --open` to see all of this as a visual panel\./);
  assert.doesNotMatch(output.value, /[\u3400-\u9fff]/u);
  assert.equal(errorOutput.value, "");
});

test("graft localizes every mirror name when Chinese is selected", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-graft-zh-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const exitCode = await main(["graft", "--days", "7", "--lang", "zh"], {
    output,
    doctorOptions: {
      fingerprint,
      advisories: [],
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    walletOptions: {
      logs: {
        turns: [],
        retries: [],
        diagnostics: {
          files_scanned: 0,
          malformed_lines: 0,
          unreadable_files: 0,
          unreadable_directories: 0,
        },
      },
      pricing,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    auditOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    deliveryOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.match(output.value, /修理镜 · Doctor/);
  assert.match(output.value, /钱包镜 · Wallet/);
  assert.match(output.value, /安全镜 · Audit/);
  assert.match(output.value, /交付镜 · Delivery/);
});

test("graft continues through audit when wallet throws", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-graft-wallet-throws-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const errorOutput = outputBuffer();
  const exitCode = await main(["graft"], {
    output,
    errorOutput,
    doctorOptions: {
      fingerprint,
      advisories: [],
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    walletOptions: {
      pricingUrl: new URL("./fixtures/missing-pricing.json", import.meta.url),
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    auditOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    deliveryOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.match(output.value, /^Doctor$/m);
  assert.match(output.value, /^Wallet$/m);
  assert.match(output.value, /Wallet could not read your logs: .+ Run `solounit wallet` for details\./);
  assert.match(output.value, /^Audit$/m);
  assert.match(output.value, /Reviewed 0 MCP servers \/ 0 config files, nothing risky found\./);
  assert.equal(errorOutput.value, "");
});

test("graft reports absent log paths and per-mirror debug scan counts", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-graft-empty-logs-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const exitCode = await main(["graft", "--debug"], {
    output,
    doctorOptions: {
      fingerprint,
      advisories: [],
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    walletOptions: {
      homeDirectory,
      pricing,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    auditOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    deliveryOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.match(output.value, /Checked these paths: .*\.claude\/projects.*\.codex\/sessions.*Found no session logs there\./);
  assert.match(output.value, /Scanned 0 advisories against your fingerprint \(claude 2\.1\.x, codex not found, darwin\)\./);
  for (const mirror of ["Doctor", "Wallet", "Audit", "Delivery"]) {
    assert.match(
      output.value,
      new RegExp(`\\[debug\\] ${mirror}: directories checked: .+; files found: \\d+; lines parsed: \\d+; lines skipped: \\d+\\.`),
    );
  }
});

test("dashboard accepts a custom output path and runs all implemented mirrors", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-dashboard-cli-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const destination = join(homeDirectory, "panel.html");
  const exitCode = await main(["dashboard", "--out", destination], {
    output,
    doctorOptions: {
      fingerprint,
      advisories: [],
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    walletOptions: {
      logs: {
        turns: [],
        retries: [],
        diagnostics: {
          files_scanned: 0,
          malformed_lines: 0,
          unreadable_files: 0,
          unreadable_directories: 0,
        },
      },
      pricing,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    auditOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    deliveryOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
    dashboardOptions: {
      homeDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(output.value, `Dashboard written to ${destination}\n`);
  const html = await readFile(destination, "utf8");
  assert.match(html, /<html lang="en">/);
  assert.match(html, />Doctor</);
  assert.match(html, />Wallet</);
  assert.match(html, />Audit</);
  assert.match(html, />Delivery</);
  assert.match(html, />Cognition</);
});

test("doctor remains a report with exit status zero", async () => {
  const output = outputBuffer();
  const exitCode = await main(["doctor", "--json"], {
    output,
    doctorOptions: { fingerprint, advisories: [] },
  });
  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.value).mirror, "doctor");
});

test("audit JSON remains a local report with exit status zero", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-cli-audit-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const exitCode = await main(["audit", "--json"], {
    output,
    auditOptions: { homeDirectory },
  });
  assert.equal(exitCode, 0);
  const report = JSON.parse(output.value);
  assert.equal(report.mirror, "audit");
  assert.equal(report.scope.network_requests, 0);
});

test("invalid wallet days fail before reading logs", async () => {
  const errorOutput = outputBuffer();
  const exitCode = await main(["wallet", "--days", "0"], { errorOutput });
  assert.equal(exitCode, 1);
  assert.match(errorOutput.value, /--days must be an integer/);
});

test("wallet validates the agent scope flag", async () => {
  const errorOutput = outputBuffer();
  const exitCode = await main(["wallet", "--agent", "other"], { errorOutput });
  assert.equal(exitCode, 1);
  assert.match(errorOutput.value, /--agent must be claude or codex/);
});

test("wallet --html writes the default local share-card path and prints it", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-wallet-card-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = outputBuffer();
  const destination = join(homeDirectory, ".oneco", "wallet-card.html");
  const exitCode = await main(["wallet", "--html"], {
    output,
    walletOptions: {
      homeDirectory,
      logs: {
        turns: [],
        retries: [],
        diagnostics: {
          files_scanned: 0,
          malformed_lines: 0,
          unreadable_files: 0,
          unreadable_directories: 0,
        },
      },
      pricing,
      now: new Date("2026-08-09T12:00:00.000Z"),
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(output.value, `Wallet card written to ${destination}\n`);
  const html = await readFile(destination, "utf8");
  assert.match(html, /API-equivalent usage/);
  assert.doesNotMatch(html, /http/i);
});

test("wallet rejects simultaneous JSON and HTML output modes", async () => {
  const errorOutput = outputBuffer();
  const exitCode = await main(["wallet", "--json", "--html"], { errorOutput });
  assert.equal(exitCode, 1);
  assert.match(errorOutput.value, /--json and --html cannot be used together/);
});
