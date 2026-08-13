import assert from "node:assert/strict";
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createAuditReport,
  redactCredentialValues,
  renderAudit,
  runAudit,
} from "../src/audit.mjs";

const fixtureHome = new URL("./fixtures/audit/home/", import.meta.url);

function outputBuffer() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

function syntheticCredentials() {
  return {
    __ANTHROPIC_KEY__: ["sk", "-ant-", "fixture", "Anthropic", "123456"].join(""),
    __OPENAI_KEY__: ["sk", "-proj-", "fixture", "OpenAI", "123456"].join(""),
    __AWS_KEY__: ["AK", "IA", "ABCDEFGHIJKLMNOP"].join(""),
    __GITHUB_TOKEN__: ["gh", "p_", "FixtureGithub123456789"].join(""),
    __SLACK_TOKEN__: ["xox", "b-", "fixture-slack-123456"].join(""),
    "{{BEARER_TOKEN}}": ["Bearer", " ", "fixture", "Bearer", "123456789"].join(""),
  };
}

async function materializeFixture(templatePath, filePath, replacements) {
  let contents = await readFile(templatePath, "utf8");
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    contents = contents.replaceAll(placeholder, replacement);
  }
  await writeFile(filePath, contents);
}

async function preparedFixture(t) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "oneco-audit-"));
  const homeDirectory = join(temporaryDirectory, "home");
  await cp(fixtureHome, homeDirectory, { recursive: true });
  const credentials = syntheticCredentials();
  await materializeFixture(
    join(homeDirectory, "env.fixture"),
    join(homeDirectory, ".env"),
    credentials,
  );
  await materializeFixture(
    join(homeDirectory, ".zshenv"),
    join(homeDirectory, ".zshenv"),
    credentials,
  );
  await materializeFixture(
    join(homeDirectory, ".zshrc"),
    join(homeDirectory, ".zshrc"),
    credentials,
  );
  await materializeFixture(
    join(homeDirectory, "Documents", "fixture-project", "env.fixture"),
    join(homeDirectory, "Documents", "fixture-project", ".env"),
    credentials,
  );
  await chmod(join(homeDirectory, ".env"), 0o640);
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const credentialValues = Object.values(credentials).map((value) =>
    value.startsWith("Bearer ") ? value.slice("Bearer ".length) : value,
  );
  return { credentials: credentialValues, homeDirectory };
}

function fixtureRegistry() {
  return [
    {
      id: "EXAMPLE-SKIPPED",
      kind: "plugin",
      name_pattern: "example-unsafe-plugin*",
      severity: "critical",
      summary: "This example must never match.",
      source: "fixture-example",
      published: "2026-08-09",
      status: "example",
    },
    {
      id: "TEST-KNOWN-BAD",
      kind: "plugin",
      name_pattern: "fixture-risk-*",
      severity: "warning",
      summary: "Synthetic known-bad registry match for the test fixture.",
      source: "fixture-registry",
      published: "2026-08-09",
      status: "published",
    },
  ];
}

test("audit fixtures cover inventories, hooks, credentials, permissions, modes, and registry matches", async (t) => {
  const { credentials, homeDirectory } = await preparedFixture(t);
  const report = await createAuditReport({
    homeDirectory,
    knownBadEntries: fixtureRegistry(),
    now: new Date("2026-08-09T12:00:00.000Z"),
  });

  assert.equal(report.mirror, "audit");
  assert.equal(report.privacy, "local-only");
  assert.equal(report.scope.network_requests, 0);
  assert.ok(report.duration_ms < 10_000);
  assert.ok(report.findings.some((entry) => entry.id === "inventory.mcp"));
  assert.ok(report.findings.some((entry) => entry.id === "inventory.plugin"));
  assert.ok(report.findings.some((entry) => entry.id === "inventory.skill"));
  assert.ok(report.findings.some((entry) => entry.id === "hook.configured"));
  assert.ok(report.findings.some((entry) => entry.id === "hook.risky"));
  assert.ok(report.findings.some((entry) => entry.id === "credential.plaintext"));
  assert.ok(report.findings.some((entry) => entry.id === "credential.permissions"));
  assert.ok(report.findings.some((entry) => entry.id === "permission.broad"));
  assert.ok(report.findings.some((entry) => entry.id === "registry.known-bad"));
  assert.equal(
    report.findings.some((entry) => entry.what.includes("out-of-scope-server")),
    false,
  );
  assert.equal(
    report.findings.some((entry) => entry.what.includes("EXAMPLE-SKIPPED")),
    false,
  );

  const terminal = renderAudit(report);
  const json = JSON.stringify(report);
  for (const credential of credentials) {
    assert.equal(terminal.includes(credential), false, "terminal output leaked a credential");
    assert.equal(json.includes(credential), false, "JSON output leaked a credential");
    assert.match(terminal, new RegExp(`${credential.slice(0, 6)}… \\(length ${credential.length}\\)`));
  }
  assert.match(terminal, /everything stayed on this machine/);
});

test("runAudit applies the final masking boundary to terminal and JSON output", async (t) => {
  const { credentials, homeDirectory } = await preparedFixture(t);
  for (const json of [false, true]) {
    const output = outputBuffer();
    const report = await runAudit({
      homeDirectory,
      knownBadEntries: fixtureRegistry(),
      json,
      output,
    });
    assert.equal(report.mirror, "audit");
    for (const credential of credentials) {
      assert.equal(output.value.includes(credential), false, "audit output leaked a credential");
    }
    if (json) assert.equal(JSON.parse(output.value).mirror, "audit");
  }
});

test("the bundled example registry entry is skipped and audit never calls fetch", async (t) => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "oneco-audit-empty-"));
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("audit attempted a network call");
  };
  try {
    const report = await createAuditReport({ homeDirectory: temporaryDirectory });
    assert.equal(report.scope.network_requests, 0);
    assert.equal(report.findings.some((entry) => entry.id === "registry.known-bad"), false);
    assert.equal(report.scope.mcp_servers, 0);
    assert.equal(report.scope.config_files, 0);
    assert.match(
      renderAudit(report),
      /Reviewed 0 MCP servers \/ 0 config files, nothing risky found\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("credential redaction is safe when untrusted hook text embeds a key", () => {
  const credential = syntheticCredentials().__OPENAI_KEY__;
  const genericCredential = ["generic", "Hook", "Credential", "123456"].join("");
  const command = [
    "curl -H 'Authorization: Bearer",
    credential,
    "' --token",
    genericCredential,
    "fixture.invalid",
  ].join(" ");
  const redacted = redactCredentialValues(command);
  assert.equal(redacted.includes(credential), false, "redaction retained a credential");
  assert.equal(
    redacted.includes(genericCredential),
    false,
    "redaction retained a generic credential",
  );
  assert.match(redacted, new RegExp(`${credential.slice(0, 6)}… \\(length ${credential.length}\\)`));
  assert.equal(redactCredentialValues(redacted), redacted);
});
