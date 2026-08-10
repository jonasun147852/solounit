import { scanEnvironment } from "./env-scan.mjs";
import { loadAdvisorySources } from "./advisory-cache.mjs";
import { t } from "./i18n.mjs";

function parseVersion(value) {
  const match = String(value || "").trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function wildcardBounds(token) {
  const normalized = token.replace(/^v/, "").toLowerCase();
  const parts = normalized.split(".");
  const wildcardIndex = parts.findIndex((part) => part === "x" || part === "*");
  if (wildcardIndex === -1) return null;
  if (wildcardIndex === 0) return { any: true };

  const lower = [0, 0, 0];
  for (let index = 0; index < wildcardIndex; index += 1) {
    lower[index] = Number(parts[index]);
  }
  const upper = [...lower];
  upper[wildcardIndex - 1] += 1;
  for (let index = wildcardIndex; index < 3; index += 1) upper[index] = 0;
  return { lower, upper };
}

function satisfiesComparator(version, comparator) {
  const wildcard = wildcardBounds(comparator);
  if (wildcard?.any) return true;
  if (wildcard) {
    return (
      compareVersions(version, wildcard.lower) >= 0 &&
      compareVersions(version, wildcard.upper) < 0
    );
  }

  if (comparator.startsWith("^")) {
    const lower = parseVersion(comparator.slice(1));
    if (!lower) return false;
    const upper = [...lower];
    if (lower[0] > 0) {
      upper[0] += 1;
      upper[1] = 0;
      upper[2] = 0;
    } else if (lower[1] > 0) {
      upper[1] += 1;
      upper[2] = 0;
    } else {
      upper[2] += 1;
    }
    return compareVersions(version, lower) >= 0 && compareVersions(version, upper) < 0;
  }

  if (comparator.startsWith("~")) {
    const lower = parseVersion(comparator.slice(1));
    if (!lower) return false;
    const upper = [lower[0], lower[1] + 1, 0];
    return compareVersions(version, lower) >= 0 && compareVersions(version, upper) < 0;
  }

  const match = comparator.match(/^(<=|>=|<|>|=)?\s*(.+)$/);
  const expected = parseVersion(match?.[2]);
  if (!expected) return false;
  const comparison = compareVersions(version, expected);
  switch (match?.[1] || "=") {
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    default:
      return comparison === 0;
  }
}

function satisfiesClause(version, clause) {
  const hyphen = clause.match(/^\s*(v?\d+(?:\.\d+){0,2})\s+-\s+(v?\d+(?:\.\d+){0,2})\s*$/);
  if (hyphen) {
    const lower = parseVersion(hyphen[1]);
    const upper = parseVersion(hyphen[2]);
    return compareVersions(version, lower) >= 0 && compareVersions(version, upper) <= 0;
  }

  return clause
    .replaceAll(",", " ")
    .split(/\s+/)
    .filter(Boolean)
    .every((comparator) => satisfiesComparator(version, comparator));
}

export function satisfiesVersion(versionValue, rangeValue) {
  const range = String(rangeValue || "*").trim();
  if (range === "" || range === "*" || range.toLowerCase() === "x") return true;
  const version = parseVersion(versionValue);
  if (!version) return false;
  return range.split(/\s*\|\|\s*/).some((clause) => satisfiesClause(version, clause));
}

function globMatches(value, pattern) {
  const expression = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}

function affectedInstallation(fingerprint, name) {
  const normalized = name.toLowerCase();
  if (normalized === "claude-code") {
    return fingerprint.claude?.present
      ? { name: "claude-code", version: fingerprint.claude.version }
      : null;
  }
  if (normalized === "node") {
    return { name: "node", version: fingerprint.node?.version || null };
  }

  const server = fingerprint.mcp_servers?.find(
    (entry) => entry.name.toLowerCase() === normalized,
  );
  if (server) return { name: server.name, version: server.version || null };

  const plugin = fingerprint.plugins?.find(
    (entry) => entry.name.toLowerCase() === normalized,
  );
  if (plugin) return { name: plugin.name, version: plugin.version || null };

  const manager = fingerprint.package_managers?.find(
    (entry) => entry.name.toLowerCase() === normalized,
  );
  if (manager) return { name: manager.name, version: manager.version || null };
  return null;
}

export function advisoryMatches(fingerprint, advisory) {
  const installation = affectedInstallation(fingerprint, advisory.affected.name);
  if (!installation) return false;

  const range = advisory.affected.versions || "*";
  if (range !== "*" && !satisfiesVersion(installation.version, range)) return false;

  const dimensions = fingerprint.dimensions || [];
  return (advisory.fingerprint_dims || []).every((expected) =>
    dimensions.some((actual) => globMatches(actual, expected)),
  );
}

export function matchAdvisories(fingerprint, advisories) {
  return advisories.filter((advisory) => advisoryMatches(fingerprint, advisory));
}

export async function loadAdvisories(advisoriesUrl, options = {}) {
  const sources = await loadAdvisorySources({
    seedUrl: advisoriesUrl,
    cachePath: options.cachePath,
    homeDirectory: options.homeDirectory,
  });
  return sources.advisories;
}

export async function createDoctorReport(options = {}) {
  const locale = options.locale || "en";
  const fingerprint = options.fingerprint || (await scanEnvironment(options.scanOptions));
  const advisories = options.advisories || (await loadAdvisories(options.advisoriesUrl, {
    cachePath: options.cachePath,
    homeDirectory: options.homeDirectory,
  }));
  const matched = matchAdvisories(fingerprint, advisories);
  const now = options.now || new Date();

  return {
    mirror: "doctor",
    locale,
    generated_at: now.toISOString(),
    privacy: "local-only",
    fingerprint,
    summary: {
      advisories_scanned: advisories.length,
      matched: matched.length,
    },
    advisories: matched,
  };
}

export function renderDoctor(report, locale = report?.locale || "en") {
  const lines = [
    t("mirror.doctor", { locale }),
    t("doctor.localReport", { locale }),
    t("doctor.environment", {
      locale,
      claude: report.fingerprint.claude.version || t("doctor.notFound", { locale }),
      node: report.fingerprint.node.version,
      platform: report.fingerprint.os.platform,
      arch: report.fingerprint.os.arch,
    }),
    t("doctor.matchCount", {
      locale,
      matched: report.summary.matched,
      scanned: report.summary.advisories_scanned,
    }),
  ];

  if (report.advisories.length === 0) {
    lines.push("", t("doctor.noMatches", { locale }));
  }

  for (const advisory of report.advisories) {
    lines.push(
      "",
      `${advisory.id}${advisory.status === "draft" ? ` [${t("doctor.draft", { locale })}]` : ""} — ${advisory.summary}`,
      t("doctor.evidence", { locale, value: advisory.evidence }),
      t("doctor.source", { locale, value: advisory.source }),
      t("doctor.fix", { locale }),
      ...advisory.fix_steps.map((step, index) => `  ${index + 1}. ${step}`),
    );
  }

  if (report.fingerprint.scan_errors.length > 0) {
    lines.push(
      "",
      t("doctor.scanErrors", { locale, count: report.fingerprint.scan_errors.length }),
    );
  }
  return lines.join("\n");
}

export async function runDoctor(options = {}) {
  const output = options.output || process.stdout;
  const locale = options.locale || "en";
  try {
    const report = await createDoctorReport(options);
    output.write(
      options.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderDoctor(report, locale)}\n`,
    );
    return report;
  } catch {
    const report = {
      mirror: "doctor",
      locale,
      generated_at: (options.now || new Date()).toISOString(),
      privacy: "local-only",
      fingerprint: null,
      summary: { advisories_scanned: 0, matched: 0 },
      advisories: [],
      error: t("doctor.error", { locale }),
    };
    output.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${report.error}\n`);
    return report;
  }
}

export const internals = {
  affectedInstallation,
  compareVersions,
  globMatches,
  parseVersion,
};
