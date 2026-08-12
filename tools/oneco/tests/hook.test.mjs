import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pluginRoot = fileURLToPath(new URL("../../oneco-plugin/", import.meta.url));
const fixturesDirectory = fileURLToPath(new URL("./fixtures/", import.meta.url));

async function runFixture(t, name) {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-hook-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const installedPluginRoot = join(homeDirectory, "solounit-plugin");
  await cp(pluginRoot, installedPluginRoot, { recursive: true });
  const input = await readFile(join(fixturesDirectory, name), "utf8");
  return spawnSync(process.execPath, [join(installedPluginRoot, "hooks", "on-failure.mjs")], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: installedPluginRoot,
      HOME: homeDirectory,
    },
    input,
  });
}

test("failure hook surfaces the matching 529 draft and its fix", async (t) => {
  const result = await runFixture(t, "hook-529.json");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  const context = output.hookSpecificOutput.additionalContext;
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUseFailure");
  assert.match(context, /DRAFT-04 \[draft\]/);
  assert.match(context, /Check https:\/\/status\.claude\.com/);
});

test("failure hook stays silent for an unrelated error", async (t) => {
  const result = await runFixture(t, "hook-unrelated.json");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
});

test("failure hook ignores permission words in npm and envelope metadata", async (t) => {
  const result = await runFixture(t, "hook-npm-login-permission.json");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, "");
});
