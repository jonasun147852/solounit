import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

export const DEFAULT_ADVISORIES_URL = new URL("./advisories/seed.json", import.meta.url);

const ADVISORY_FIELDS = [
  "id",
  "affected",
  "error_class",
  "fingerprint_dims",
  "summary",
  "evidence",
  "fix_steps",
  "source",
  "status",
  "published",
];
const ADVISORY_STATUSES = new Set(["draft", "published", "withdrawn"]);

export function advisoryCachePath(homeDirectory = homedir()) {
  return join(homeDirectory, ".oneco", "advisories.json");
}

export function validateAdvisory(value, path = "advisory") {
  const input = strictObject(value, ADVISORY_FIELDS, path);
  const affected = strictObject(input.affected, ["name", "versions"], `${path}.affected`);
  const id = stringValue(input.id, `${path}.id`, 3, 80);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]+$/.test(id)) {
    invalid(`${path}.id`, "must be a valid advisory identifier");
  }
  const errorClass = stringValue(input.error_class, `${path}.error_class`, 1, 120);
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(errorClass)) {
    invalid(`${path}.error_class`, "must be a lowercase slug");
  }
  if (!ADVISORY_STATUSES.has(input.status)) {
    invalid(`${path}.status`, "must be draft, published, or withdrawn");
  }

  return {
    id,
    affected: {
      name: stringValue(affected.name, `${path}.affected.name`, 1, 120),
      versions: stringValue(affected.versions, `${path}.affected.versions`, 1, 240),
    },
    error_class: errorClass,
    fingerprint_dims: stringArray(input.fingerprint_dims, `${path}.fingerprint_dims`, 0, 64, 200),
    summary: stringValue(input.summary, `${path}.summary`, 1, 500),
    evidence: stringValue(input.evidence, `${path}.evidence`, 1, 2_000),
    fix_steps: stringArray(input.fix_steps, `${path}.fix_steps`, 1, 20, 1_000),
    source: stringValue(input.source, `${path}.source`, 1, 2_000),
    status: input.status,
    published: calendarDate(input.published, `${path}.published`),
  };
}

export function validateAdvisoryList(value, path = "advisories") {
  if (!Array.isArray(value)) invalid(path, "must be an array");
  if (value.length > 10_000) invalid(path, "must contain no more than 10000 entries");
  return value.map((entry, index) => validateAdvisory(entry, `${path}.${index}`));
}

export function parseAdvisoryResponse(value) {
  if (Array.isArray(value)) return validateAdvisoryList(value);
  const input = strictObject(value, ["advisories"], "response");
  return validateAdvisoryList(input.advisories);
}

export function mergeAdvisories(bundled, cached) {
  const merged = new Map();
  for (const advisory of bundled) merged.set(advisory.id, advisory);
  for (const advisory of cached) merged.set(advisory.id, advisory);
  return [...merged.values()];
}

export async function loadAdvisorySources(options = {}) {
  const seedUrl = options.seedUrl || DEFAULT_ADVISORIES_URL;
  const cachePath = options.cachePath || advisoryCachePath(options.homeDirectory);
  const bundled = validateAdvisoryList(
    JSON.parse(await readFile(seedUrl, "utf8")),
    "bundled_advisories",
  );
  const cache = await readAdvisoryCache(cachePath);
  return {
    advisories: mergeAdvisories(bundled, cache.advisories),
    bundled,
    cached: cache.advisories,
    cacheUpdatedAt: cache.updatedAt,
  };
}

export async function readAdvisoryCache(path = advisoryCachePath()) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (Array.isArray(parsed)) {
      return {
        advisories: validateAdvisoryList(parsed, "cached_advisories"),
        updatedAt: null,
      };
    }
    const input = strictObject(parsed, ["updated_at", "advisories"], "cache");
    return {
      advisories: validateAdvisoryList(input.advisories, "cached_advisories"),
      updatedAt: isoTimestamp(input.updated_at, "cache.updated_at"),
    };
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError || error instanceof AdvisoryValidationError) {
      return { advisories: [], updatedAt: null };
    }
    throw error;
  }
}

export async function writeAdvisoryCache(
  advisories,
  options = {},
) {
  const path = options.path || advisoryCachePath(options.homeDirectory);
  const updatedAt = (options.now || new Date()).toISOString();
  const validated = validateAdvisoryList(advisories);
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ updated_at: updatedAt, advisories: validated }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return { path, updatedAt, advisories: validated };
}

export function advisoryEndpointUrl(baseUrl) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("--url must be a valid http:// or https:// base URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("--url must not contain credentials");
  }
  url.search = "";
  url.hash = "";
  if (url.pathname.replace(/\/+$/, "") !== "/api/advisories") {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api/advisories`;
  }
  return url;
}

class AdvisoryValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdvisoryValidationError";
  }
}

function strictObject(value, allowedFields, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "must be an object");
  }
  const unknown = Object.keys(value).filter((field) => !allowedFields.includes(field));
  if (unknown.length > 0) {
    invalid(path, `contains unsupported field(s): ${unknown.join(", ")}`);
  }
  return value;
}

function stringValue(value, path, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max || value.trim() !== value) {
    invalid(path, `must be a trimmed string containing ${min}-${max} characters`);
  }
  return value;
}

function stringArray(value, path, minItems, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    invalid(path, `must contain ${minItems}-${maxItems} items`);
  }
  return value.map((item, index) => stringValue(item, `${path}.${index}`, 1, maxLength));
}

function calendarDate(value, path) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(path, "must use YYYY-MM-DD format");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(path, "must be a valid calendar date");
  }
  return value;
}

function isoTimestamp(value, path) {
  if (typeof value !== "string") invalid(path, "must be an ISO-8601 timestamp");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    invalid(path, "must be an ISO-8601 timestamp");
  }
  return value;
}

function invalid(path, message) {
  throw new AdvisoryValidationError(`Invalid advisory data at ${path}: ${message}.`);
}
