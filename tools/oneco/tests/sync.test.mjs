import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../bin/oneco.mjs";
import { syncAdvisories } from "../src/sync.mjs";

function advisory(overrides = {}) {
  return {
    id: "ONECO-2026-9000",
    affected: { name: "claude-code", versions: "*" },
    error_class: "test-failure",
    fingerprint_dims: ["claude:*"],
    summary: "A test advisory summary.",
    evidence: "Scrubbed test evidence.",
    fix_steps: ["Apply the documented fix."],
    source: "fixture.jsonl:1",
    status: "published",
    published: "2026-08-09",
    ...overrides,
  };
}

function outputBuffer() {
  return {
    value: "",
    write(chunk) {
      this.value += chunk;
    },
  };
}

test("sync uses an injected loader, validates entries, and writes cache metadata", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-sync-"));
  const requests = [];
  try {
    const result = await syncAdvisories({
      url: "http://localhost:8787",
      homeDirectory,
      now: new Date("2026-08-09T12:34:56.000Z"),
      async loader(url, init) {
        requests.push({ url, init });
        return new Response(JSON.stringify({ advisories: [advisory()] }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    const cache = JSON.parse(
      await readFile(join(homeDirectory, ".oneco", "advisories.json"), "utf8"),
    );

    assert.equal(result.fetched, 1);
    assert.equal(result.updatedAt, "2026-08-09T12:34:56.000Z");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://localhost:8787/api/advisories");
    assert.equal(requests[0].init.headers.accept, "application/json");
    assert.equal(cache.updated_at, result.updatedAt);
    assert.deepEqual(cache.advisories, [advisory()]);
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("sync rejects unknown advisory fields without replacing the cache", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "oneco-sync-invalid-"));
  try {
    await assert.rejects(
      syncAdvisories({
        url: "https://hub.example.test",
        homeDirectory,
        async loader() {
          return { advisories: [advisory({ owner: "attacker" })] };
        },
      }),
      /unsupported field.*owner/i,
    );
    await assert.rejects(
      readFile(join(homeDirectory, ".oneco", "advisories.json"), "utf8"),
      { code: "ENOENT" },
    );
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
});

test("sync without an explicit URL exits 1 without calling the loader", async () => {
  const errorOutput = outputBuffer();
  let loaded = false;
  const exitCode = await main(["sync"], {
    errorOutput,
    syncOptions: {
      environment: {},
      async loader() {
        loaded = true;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(loaded, false);
  assert.match(errorOutput.value, /oneco sync --url http:\/\/localhost:8787/);
});
