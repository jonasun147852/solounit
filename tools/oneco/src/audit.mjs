import { lstat, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const DEFAULT_REGISTRY_URL = new URL("./security/known-bad-seed.json", import.meta.url);
const SEVERITIES = ["critical", "warning", "info"];
const PROJECT_SCAN_DEPTH = 3;
const SKIPPED_PROJECT_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);
const NETWORK_BINARIES = new Set([
  "curl",
  "ftp",
  "nc",
  "ncat",
  "netcat",
  "scp",
  "sftp",
  "ssh",
  "telnet",
  "wget",
]);

const CREDENTIAL_PATTERNS = [
  {
    kind: "Anthropic key",
    expression: /\bsk-ant-[A-Za-z0-9_-]{6,}\b/g,
  },
  {
    kind: "OpenAI project key",
    expression: /\bsk-proj-[A-Za-z0-9_-]{6,}\b/g,
  },
  {
    kind: "AWS access key",
    expression: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    kind: "GitHub personal access token",
    expression: /\bghp_[A-Za-z0-9]{8,}\b/g,
  },
  {
    kind: "Slack token",
    expression: /\bxox[bp]-[A-Za-z0-9-]{8,}\b/g,
  },
  {
    kind: "Bearer token",
    expression: /\bBearer[ \t]+([A-Za-z0-9._~+/=-]{8,})/gi,
    valueGroup: 1,
  },
];

function credentialPreview(value) {
  const prefix = value.length > 6 ? `${value.slice(0, 6)}…` : "short value";
  return `${prefix} (length ${value.length})`;
}

function replacementForCredential(match, pattern) {
  const value = pattern.valueGroup ? match[pattern.valueGroup] : match[0];
  const replacement = `[MASKED ${credentialPreview(value)}]`;
  if (!pattern.valueGroup) return replacement;
  return match[0].replace(value, replacement);
}

export function redactCredentialValues(value) {
  let redacted = String(value ?? "");
  redacted = redacted.replace(
    /\b((?:api[_-]?key|secret|token|password|credential|authorization)\s*(?:=|:)\s*)(["'])(?!\[MASKED\b)([^"'\r\n]+)\2/gi,
    (_match, prefix, quote, credential) =>
      `${prefix}${quote}[MASKED ${credentialPreview(credential)}]${quote}`,
  );
  redacted = redacted.replace(
    /\b(authorization\s*(?:=|:)\s*)((?:Bearer|Basic)\s+)(?!\[MASKED\b)([^\s"',;}]+)/gi,
    (_match, prefix, scheme, credential) =>
      `${prefix}${scheme}[MASKED ${credentialPreview(credential)}]`,
  );
  redacted = redacted.replace(
    /\b(authorization\s*(?:=|:)\s*)(?!(?:Bearer|Basic)\b|\[MASKED\b)([^\s"',;}]+)/gi,
    (_match, prefix, credential) => `${prefix}[MASKED ${credentialPreview(credential)}]`,
  );
  redacted = redacted.replace(
    /\b((?:api[_-]?key|secret|token|password|credential)\s*(?:=|:)\s*)(?!\[MASKED\b)([^\s"',;}]+)/gi,
    (_match, prefix, credential) => `${prefix}[MASKED ${credentialPreview(credential)}]`,
  );
  redacted = redacted.replace(
    /(--(?:api[_-]?key|secret|token|password|credential)(?:=|\s+))(?!\[MASKED\b)([^\s"',;}]+)/gi,
    (_match, prefix, credential) => `${prefix}[MASKED ${credentialPreview(credential)}]`,
  );
  for (const pattern of CREDENTIAL_PATTERNS) {
    const expression = new RegExp(pattern.expression.source, pattern.expression.flags);
    redacted = redacted.replace(expression, (...arguments_) => {
      const captures = arguments_.slice(0, -2);
      return replacementForCredential(captures, pattern);
    });
  }
  return redacted;
}

function safeText(value, maximumLength = 500) {
  const redacted = redactCredentialValues(value).replace(/[\r\n]+/g, " ").trim();
  if (redacted.length <= maximumLength) return redacted;
  return `${redacted.slice(0, maximumLength - 1)}…`;
}

function displayPath(filePath, homeDirectory) {
  const resolvedPath = resolve(filePath);
  const resolvedHome = resolve(homeDirectory);
  if (resolvedPath === resolvedHome) return "~";
  if (resolvedPath.startsWith(`${resolvedHome}${sep}`)) {
    return `~/${resolvedPath.slice(resolvedHome.length + 1)}`;
  }
  return resolvedPath;
}

function finding(severity, id, what, where, why, fix) {
  return {
    severity: SEVERITIES.includes(severity) ? severity : "warning",
    id: safeText(id, 100),
    what: safeText(what),
    where: safeText(where),
    why: safeText(why),
    fix: safeText(fix),
  };
}

function scanErrorFinding(filePath, homeDirectory, reason) {
  return finding(
    "info",
    "scan.unreadable",
    "A configured audit location could not be inspected",
    displayPath(filePath, homeDirectory),
    reason,
    "Check that the path is a regular readable file and retry the audit.",
  );
}

async function fileStatus(filePath) {
  try {
    const status = await lstat(filePath);
    if (status.isSymbolicLink()) return { status, state: "symlink" };
    if (!status.isFile()) return { status, state: "not-file" };
    return { status, state: "file" };
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { status: null, state: "missing" };
    }
    return { status: null, state: "unreadable" };
  }
}

async function readLocalFile(filePath, homeDirectory, findings) {
  const checked = await fileStatus(filePath);
  if (checked.state === "missing") return null;
  if (checked.state === "symlink") {
    findings.push(
      scanErrorFinding(
        filePath,
        homeDirectory,
        "Symlinks are not followed so the scan cannot escape its documented locations.",
      ),
    );
    return null;
  }
  if (checked.state !== "file") {
    findings.push(
      scanErrorFinding(filePath, homeDirectory, "The location is not a readable regular file."),
    );
    return null;
  }

  try {
    return { contents: await readFile(filePath, "utf8"), status: checked.status };
  } catch {
    findings.push(
      scanErrorFinding(filePath, homeDirectory, "The regular file could not be read."),
    );
    return null;
  }
}

async function readJsonFile(filePath, homeDirectory, findings) {
  const localFile = await readLocalFile(filePath, homeDirectory, findings);
  if (!localFile) return null;
  try {
    return { value: JSON.parse(localFile.contents), status: localFile.status };
  } catch {
    findings.push(
      finding(
        "info",
        "scan.invalid-json",
        "A configuration file contains invalid JSON",
        displayPath(filePath, homeDirectory),
        "Malformed configuration cannot be checked for risky access.",
        "Repair the JSON and run oneco audit again.",
      ),
    );
    return null;
  }
}

async function discoverProjectConfiguration(documentsDirectory, homeDirectory, findings) {
  const configurationFiles = [];
  const repositoryRoots = new Set();
  const queue = [{ directory: documentsDirectory, depth: 0 }];

  while (queue.length > 0) {
    const { directory, depth } = queue.shift();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        findings.push(
          scanErrorFinding(
            directory,
            homeDirectory,
            "A project directory could not be listed during the bounded scan.",
          ),
        );
      }
      continue;
    }

    const mcpEntry = entries.find((entry) => entry.name === ".mcp.json" && entry.isFile());
    if (mcpEntry) {
      configurationFiles.push({ path: join(directory, mcpEntry.name), type: "project-mcp" });
      repositoryRoots.add(directory);
    }

    const claudeEntry = entries.find(
      (entry) => entry.name === ".claude" && entry.isDirectory(),
    );
    if (claudeEntry) {
      const settingsPath = join(directory, ".claude", "settings.json");
      const checked = await fileStatus(settingsPath);
      if (checked.state !== "missing") {
        configurationFiles.push({ path: settingsPath, type: "project-settings" });
        repositoryRoots.add(directory);
      }
    }

    if (depth >= PROJECT_SCAN_DEPTH) continue;
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_PROJECT_DIRECTORIES.has(entry.name)) continue;
      if (entry.name === ".claude") continue;
      queue.push({ directory: join(directory, entry.name), depth: depth + 1 });
    }
  }

  return { configurationFiles, repositoryRoots: [...repositoryRoots] };
}

function namedEntries(value, enabledOnly = false) {
  const names = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") names.push(entry);
      else if (entry && typeof entry === "object" && typeof entry.name === "string") {
        names.push(entry.name);
      }
    }
    return names;
  }
  if (!value || typeof value !== "object") return names;
  for (const [name, config] of Object.entries(value)) {
    if (!enabledOnly || config === true) names.push(name);
  }
  return names;
}

function collectInventories(config, source, inventories) {
  if (!config || typeof config !== "object" || Array.isArray(config)) return;

  const add = (kind, names) => {
    for (const name of names) {
      if (typeof name !== "string" || name.trim() === "") continue;
      const key = `${kind}\0${name}`;
      if (!inventories.has(key)) inventories.set(key, { kind, name, sources: new Set() });
      inventories.get(key).sources.add(source);
    }
  };

  add("mcp", namedEntries(config.mcpServers));
  add("plugin", namedEntries(config.enabledPlugins, true));
  add("plugin", namedEntries(config.plugins));
  add("skill", namedEntries(config.enabledSkills, true));
  add("skill", namedEntries(config.skills));

  if (config.projects && typeof config.projects === "object") {
    for (const project of Object.values(config.projects)) {
      collectInventories(project, source, inventories);
    }
  }
}

function collectHookCommands(value, location = "hooks", target = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectHookCommands(entry, `${location}[${index}]`, target));
    return target;
  }
  if (!value || typeof value !== "object") return target;
  for (const [key, entry] of Object.entries(value)) {
    const entryLocation = `${location}.${key}`;
    if (key === "command" && typeof entry === "string") {
      target.push({ command: entry, location: entryLocation });
    } else {
      collectHookCommands(entry, entryLocation, target);
    }
  }
  return target;
}

function commandTokens(command) {
  return String(command)
    .split(/[\s;&|()]+/)
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function networkBinariesIn(command) {
  const matches = new Set();
  for (const token of commandTokens(command)) {
    const name = basename(token).toLowerCase();
    if (NETWORK_BINARIES.has(name)) matches.add(name);
  }
  return [...matches].sort();
}

// Standard toolchain prefixes: hooks legitimately invoke system binaries from
// these locations, so they are not treated as suspicious destinations.
const TRUSTED_ABSOLUTE_PREFIXES = ["/usr/", "/bin/", "/sbin/", "/opt/homebrew/"];

function outsideHomePaths(command, homeDirectory) {
  // Only absolute paths count: relative paths resolve against the project the
  // settings file lives in, and flagging them floods the report with false
  // criticals (alert habituation kills the whole mirror).
  const resolvedHome = resolve(homeDirectory);
  const paths = new Set();
  for (const token of commandTokens(command)) {
    if (token.startsWith("$") || token.startsWith("~")) continue;
    if (!token.startsWith("/")) continue;
    if (TRUSTED_ABSOLUTE_PREFIXES.some((prefix) => token.startsWith(prefix))) continue;
    const normalized = resolve(token);
    if (normalized !== resolvedHome && !normalized.startsWith(`${resolvedHome}${sep}`)) {
      paths.add(token);
    }
  }
  return [...paths].sort();
}

function hookFindings(config, source, homeDirectory) {
  const findings = [];
  for (const hook of collectHookCommands(config?.hooks)) {
    const networkBinaries = networkBinariesIn(hook.command);
    const outsidePaths = outsideHomePaths(hook.command, homeDirectory);
    const unsafe = networkBinaries.length > 0 || outsidePaths.length > 0;
    const reasons = [];
    if (networkBinaries.length > 0) {
      reasons.push(`it invokes network-capable executable(s): ${networkBinaries.join(", ")}`);
    }
    if (outsidePaths.length > 0) reasons.push("it references a path outside the user home");
    findings.push(
      finding(
        unsafe ? "critical" : "info",
        unsafe ? "hook.risky" : "hook.configured",
        `Hook command: ${hook.command}`,
        `${source}#${hook.location}`,
        unsafe
          ? `This hook runs automatically and ${reasons.join("; ")}.`
          : "Hooks run automatically with the agent's local access.",
        unsafe
          ? "Disable the hook until its command and destination are explicitly trusted."
          : "Keep the hook only while its command and target remain expected.",
      ),
    );
  }
  return findings;
}

function broadPermission(permission) {
  const value = String(permission).trim();
  if (/^Bash\(\s*\*\s*\)$/i.test(value)) {
    return { severity: "critical", reason: "it allows every shell command" };
  }
  if (/^Bash\(\s*rm(?::|\s).*\*.*\)$/i.test(value)) {
    return { severity: "warning", reason: "it broadly allows destructive file removal" };
  }
  const bashNetwork = value.match(/^Bash\(\s*([A-Za-z0-9_-]+)(?::|\s).*\*.*\)$/i);
  if (bashNetwork && NETWORK_BINARIES.has(bashNetwork[1].toLowerCase())) {
    return { severity: "critical", reason: "it broadly allows a network-capable command" };
  }
  if (/^(?:WebFetch|WebSearch)\(\s*\*\s*\)$/i.test(value)) {
    return { severity: "critical", reason: "it grants wildcard network access" };
  }
  return null;
}

function permissionFindings(config, source) {
  const permissions = config?.permissions?.allow;
  if (!Array.isArray(permissions)) return [];
  const findings = [];
  permissions.forEach((permission, index) => {
    if (typeof permission !== "string") return;
    const broad = broadPermission(permission);
    if (!broad) return;
    findings.push(
      finding(
        broad.severity,
        "permission.broad",
        `Broad permission allowlist entry: ${permission}`,
        `${source}#permissions.allow[${index}]`,
        `The allowlist bypasses per-command approval because ${broad.reason}.`,
        "Replace the wildcard with the smallest exact command pattern that is required.",
      ),
    );
  });
  return findings;
}

function lineNumberAt(contents, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (contents.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function credentialFindings(contents, source) {
  const findings = [];
  const matchedRanges = new Set();
  for (const pattern of CREDENTIAL_PATTERNS) {
    const expression = new RegExp(pattern.expression.source, pattern.expression.flags);
    for (const match of contents.matchAll(expression)) {
      const value = pattern.valueGroup ? match[pattern.valueGroup] : match[0];
      const offset = match.index + (pattern.valueGroup ? match[0].indexOf(value) : 0);
      const range = `${offset}:${offset + value.length}`;
      if (matchedRanges.has(range)) continue;
      matchedRanges.add(range);
      findings.push(
        finding(
          "critical",
          "credential.plaintext",
          `Plaintext ${pattern.kind} — ${credentialPreview(value)}`,
          `${source}:${lineNumberAt(contents, offset)}`,
          "A local process or copied configuration could expose this credential.",
          "Revoke and rotate it, then store the replacement in a scoped secret manager.",
        ),
      );
    }
  }
  return findings;
}

function permissionModeFinding(filePath, status, homeDirectory) {
  const exposedBits = status.mode & 0o044;
  if (exposedBits === 0) return null;
  const audience = status.mode & 0o004 ? "world-readable" : "group-readable";
  return finding(
    "warning",
    "credential.permissions",
    `Credential candidate file is ${audience}`,
    displayPath(filePath, homeDirectory),
    "Other local accounts may be able to read credentials stored in this file.",
    `Restrict the mode to the owner only, for example: chmod 600 ${displayPath(filePath, homeDirectory)}`,
  );
}

function globMatches(value, pattern) {
  const expression = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}

async function loadKnownBadEntries(options, homeDirectory, findings) {
  if (options.knownBadEntries) return options.knownBadEntries;
  const registryPath = options.registryPath || DEFAULT_REGISTRY_URL;
  try {
    const parsed = JSON.parse(await readFile(registryPath, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.entries || [];
  } catch {
    findings.push(
      scanErrorFinding(
        registryPath instanceof URL ? registryPath.pathname : registryPath,
        homeDirectory,
        "The bundled known-bad registry could not be loaded.",
      ),
    );
    return [];
  }
}

function knownBadFindings(inventories, registryEntries) {
  const findings = [];
  for (const entry of registryEntries) {
    if (!entry || entry.status === "example") continue;
    if (!SEVERITIES.includes(entry.severity)) continue;
    if (!["mcp", "plugin", "skill"].includes(entry.kind)) continue;
    if (typeof entry.name_pattern !== "string") continue;
    for (const inventory of inventories.values()) {
      if (inventory.kind !== entry.kind || !globMatches(inventory.name, entry.name_pattern)) {
        continue;
      }
      findings.push(
        finding(
          entry.severity,
          "registry.known-bad",
          `Known-bad ${inventory.kind} matched ${entry.id}: ${inventory.name}`,
          [...inventory.sources].sort().join(", "),
          entry.summary,
          `Disable or remove it, then review the registry source: ${entry.source}`,
        ),
      );
    }
  }
  return findings;
}

function inventoryFindings(inventories) {
  return [...inventories.values()].map((inventory) =>
    finding(
      "info",
      `inventory.${inventory.kind}`,
      `Configured ${inventory.kind}: ${inventory.name}`,
      [...inventory.sources].sort().join(", "),
      "Installed agent integrations inherit access from their local configuration.",
      "Remove or disable it if the name, source, or granted access is unexpected.",
    ),
  );
}

function summarize(findings) {
  const summary = { critical: 0, warning: 0, info: 0, total: findings.length };
  findings.forEach((entry) => {
    summary[entry.severity] += 1;
  });
  return summary;
}

function sortFindings(findings) {
  return findings.sort((left, right) => {
    const severity = SEVERITIES.indexOf(left.severity) - SEVERITIES.indexOf(right.severity);
    if (severity !== 0) return severity;
    return left.what.localeCompare(right.what) || left.where.localeCompare(right.where);
  });
}

export async function createAuditReport(options = {}) {
  const startedAt = process.hrtime.bigint();
  const homeDirectory = resolve(options.homeDirectory || homedir());
  const documentsDirectory = resolve(
    options.documentsDirectory || join(homeDirectory, "Documents"),
  );
  const now = options.now || new Date();
  const findings = [];
  const inventories = new Map();
  const homeConfigurationFiles = [
    { path: join(homeDirectory, ".claude.json"), type: "home-state" },
    { path: join(homeDirectory, ".claude", "settings.json"), type: "home-settings" },
    {
      path: join(homeDirectory, ".claude", "plugins", "installed_plugins.json"),
      type: "installed-plugins",
    },
  ];
  const discovered = await discoverProjectConfiguration(
    documentsDirectory,
    homeDirectory,
    findings,
  );
  const configurationFiles = [...homeConfigurationFiles, ...discovered.configurationFiles];

  for (const configurationFile of configurationFiles) {
    const parsed = await readJsonFile(configurationFile.path, homeDirectory, findings);
    if (!parsed) continue;
    const source = displayPath(configurationFile.path, homeDirectory);
    collectInventories(parsed.value, source, inventories);
    if (configurationFile.type.endsWith("settings")) {
      findings.push(...hookFindings(parsed.value, source, homeDirectory));
      findings.push(...permissionFindings(parsed.value, source));
    }
  }

  const credentialFiles = new Set([
    join(homeDirectory, ".claude", "settings.json"),
    join(homeDirectory, ".claude.json"),
    join(homeDirectory, ".zshrc"),
    join(homeDirectory, ".zshenv"),
    join(homeDirectory, ".env"),
    ...discovered.repositoryRoots.map((root) => join(root, ".env")),
  ]);
  for (const filePath of credentialFiles) {
    const localFile = await readLocalFile(filePath, homeDirectory, findings);
    if (!localFile) continue;
    const source = displayPath(filePath, homeDirectory);
    findings.push(...credentialFindings(localFile.contents, source));
    const modeFinding = permissionModeFinding(filePath, localFile.status, homeDirectory);
    if (modeFinding) findings.push(modeFinding);
  }

  const registryEntries = await loadKnownBadEntries(options, homeDirectory, findings);
  findings.push(...knownBadFindings(inventories, registryEntries));
  findings.push(...inventoryFindings(inventories));
  sortFindings(findings);
  const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  return {
    mirror: "audit",
    generated_at: now.toISOString(),
    privacy: "local-only",
    duration_ms: Math.round(elapsed * 100) / 100,
    scope: {
      home_files: homeConfigurationFiles.map((entry) => displayPath(entry.path, homeDirectory)),
      project_root: displayPath(documentsDirectory, homeDirectory),
      project_max_depth: PROJECT_SCAN_DEPTH,
      project_configuration_files: discovered.configurationFiles.length,
      network_requests: 0,
    },
    summary: summarize(findings),
    findings,
  };
}

export function renderAudit(report) {
  const lines = [
    "Audit（安全镜）",
    "Local-only access report — no network requests were made.",
  ];
  for (const severity of SEVERITIES) {
    const matches = report.findings.filter((entry) => entry.severity === severity);
    lines.push("", `${severity.toUpperCase()} (${matches.length})`);
    if (matches.length === 0) lines.push("  None.");
    for (const entry of matches) {
      lines.push(
        `  [${entry.id}] ${entry.what}`,
        `    Where: ${entry.where}`,
        `    Why: ${entry.why}`,
        `    Fix: ${entry.fix}`,
      );
    }
  }
  lines.push(
    "",
    `${report.summary.critical} critical · ${report.summary.warning} warning · ${report.summary.info} info · ${report.summary.total} total — everything stayed on this machine.`,
  );
  return redactCredentialValues(lines.join("\n"));
}

function failedAuditReport(now) {
  const findings = [
    finding(
      "warning",
      "audit.incomplete",
      "The local audit could not be completed",
      "documented local audit locations",
      "An internal failure prevented a complete access review.",
      "Retry the command; if it repeats, inspect the local oneco installation.",
    ),
  ];
  return {
    mirror: "audit",
    generated_at: now.toISOString(),
    privacy: "local-only",
    duration_ms: 0,
    scope: { network_requests: 0 },
    summary: summarize(findings),
    findings,
  };
}

export async function runAudit(options = {}) {
  const output = options.output || process.stdout;
  let report;
  try {
    report = await createAuditReport(options);
  } catch {
    report = failedAuditReport(options.now || new Date());
  }
  const rendered = options.json
    ? JSON.stringify(report, null, 2)
    : renderAudit(report);
  output.write(`${redactCredentialValues(rendered)}\n`);
  return report;
}

export const internals = {
  broadPermission,
  collectHookCommands,
  collectInventories,
  credentialFindings,
  discoverProjectConfiguration,
  globMatches,
  networkBinariesIn,
  outsideHomePaths,
};
