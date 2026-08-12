import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { homedir, platform, release, arch } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { detectLogSources } from "./log-sources.mjs";

const PACKAGE_MANAGERS = [
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "corepack",
  "brew",
  "uv",
  "pip",
  "pip3",
];

function displayPath(filePath, homeDirectory) {
  if (filePath === homeDirectory) return "~";
  if (filePath.startsWith(`${homeDirectory}/`)) {
    return `~/${filePath.slice(homeDirectory.length + 1)}`;
  }
  return filePath;
}

async function readJson(filePath, homeDirectory, errors) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    errors.push({
      source: displayPath(filePath, homeDirectory),
      error: error instanceof SyntaxError ? "invalid-json" : "unreadable",
    });
    return null;
  }
}

function addNamedEntries(value, source, target, enabledOnly = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [name, config] of Object.entries(value)) {
    if (enabledOnly && config !== true) continue;
    if (!target.has(name)) target.set(name, new Set());
    target.get(name).add(source);
  }
}

function collectConfiguration(config, source, mcpServers, plugins) {
  if (!config || typeof config !== "object") return;

  addNamedEntries(config.mcpServers, source, mcpServers);
  addNamedEntries(config.enabledPlugins, source, plugins, true);

  if (config.projects && typeof config.projects === "object") {
    for (const project of Object.values(config.projects)) {
      if (!project || typeof project !== "object") continue;
      addNamedEntries(project.mcpServers, source, mcpServers);
      addNamedEntries(project.enabledPlugins, source, plugins, true);
    }
  }

  if (config.plugins && typeof config.plugins === "object") {
    addNamedEntries(config.plugins, source, plugins);
  }
}

function projectConfigPaths(currentDirectory) {
  const paths = [];
  let cursor = resolve(currentDirectory);
  while (true) {
    paths.push(join(cursor, ".claude", "settings.json"));
    paths.push(join(cursor, ".mcp.json"));
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return paths;
}

function executableCandidates(name, environment) {
  if (process.platform !== "win32") return [name];
  const extensions = (environment.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";");
  return extensions.map((extension) => `${name}${extension.toLowerCase()}`);
}

export async function findExecutable(name, environment = process.env) {
  const pathValue = environment.PATH;
  if (!pathValue) return null;

  for (const directory of pathValue.split(process.platform === "win32" ? ";" : ":")) {
    if (!directory) continue;
    for (const candidate of executableCandidates(name, environment)) {
      const filePath = join(directory, candidate);
      try {
        await access(filePath, fsConstants.X_OK);
        return filePath;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return null;
}

function runVersionCommand(executable) {
  return new Promise((resolveVersion) => {
    execFile(executable, ["--version"], { timeout: 3_000 }, (error, stdout, stderr) => {
      if (error) {
        resolveVersion(null);
        return;
      }
      resolveVersion(`${stdout || ""}\n${stderr || ""}`.trim());
    });
  });
}

function extractVersion(value) {
  const match = String(value || "").match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
  return match?.[1] || null;
}

function compareVersionStrings(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

async function claudeMetadataVersion(homeDirectory, errors) {
  const updatePath = join(homeDirectory, ".claude", ".last-update-result.json");
  const update = await readJson(updatePath, homeDirectory, errors);
  const updateVersion = extractVersion(
    update?.version_to || update?.targetVersion || update?.version_from,
  );
  if (updateVersion) {
    return { version: updateVersion, source: displayPath(updatePath, homeDirectory) };
  }

  const statePath = join(homeDirectory, ".claude.json");
  const state = await readJson(statePath, homeDirectory, errors);
  const stateVersion = extractVersion(
    state?.lastOnboardingVersion || state?.lastReleaseNotesSeen,
  );
  if (stateVersion) {
    return { version: stateVersion, source: displayPath(statePath, homeDirectory) };
  }

  const downloadsPath = join(homeDirectory, ".claude", "downloads");
  try {
    const versions = (await readdir(downloadsPath))
      .map((name) => extractVersion(name))
      .filter(Boolean)
      .sort(compareVersionStrings);
    if (versions.length > 0) {
      return {
        version: versions.at(-1),
        source: displayPath(downloadsPath, homeDirectory),
      };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      errors.push({
        source: displayPath(downloadsPath, homeDirectory),
        error: "unreadable",
      });
    }
  }

  return { version: null, source: null };
}

function configuredItems(entries) {
  return [...entries.entries()]
    .map(([name, sources]) => ({ name, sources: [...sources].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function fingerprintDimensions(fingerprint) {
  const dimensions = [
    `os:${fingerprint.os.platform}`,
    `arch:${fingerprint.os.arch}`,
    `node:${fingerprint.node.version}`,
  ];

  if (fingerprint.claude.version) {
    dimensions.push(`claude:${fingerprint.claude.version}`);
  }
  if (fingerprint.codex?.present) {
    dimensions.push(`codex:${fingerprint.codex.version || "detected"}`);
  }
  for (const server of fingerprint.mcp_servers) dimensions.push(`mcp:${server.name}`);
  for (const plugin of fingerprint.plugins) dimensions.push(`plugin:${plugin.name}`);
  for (const manager of fingerprint.package_managers) {
    dimensions.push(`package-manager:${manager.name}`);
  }
  return dimensions.sort();
}

export async function scanEnvironment(options = {}) {
  const homeDirectory = options.homeDirectory || homedir();
  const currentDirectory = options.currentDirectory || process.cwd();
  const environment = options.environment || process.env;
  const errors = [];
  const mcpServers = new Map();
  const plugins = new Map();

  const configPaths = [
    join(homeDirectory, ".claude.json"),
    join(homeDirectory, ".claude", "settings.json"),
    join(homeDirectory, ".claude", "plugins", "installed_plugins.json"),
    ...projectConfigPaths(currentDirectory),
  ];

  for (const filePath of [...new Set(configPaths)]) {
    const config = await readJson(filePath, homeDirectory, errors);
    if (config) {
      collectConfiguration(
        config,
        displayPath(filePath, homeDirectory),
        mcpServers,
        plugins,
      );
    }
  }

  const claudeExecutable = await findExecutable("claude", environment);
  const commandVersion = claudeExecutable
    ? extractVersion(await runVersionCommand(claudeExecutable))
    : null;
  const metadata = commandVersion
    ? null
    : await claudeMetadataVersion(homeDirectory, errors);
  const codexExecutable = await findExecutable("codex", environment);
  const codexVersion = codexExecutable
    ? extractVersion(await runVersionCommand(codexExecutable))
    : null;
  const detectedSources = options.detectedSources || await detectLogSources({ homeDirectory });
  const detectedAgents = new Set(detectedSources.map((source) => source.agent));

  const packageManagers = [];
  for (const name of PACKAGE_MANAGERS) {
    if (await findExecutable(name, environment)) packageManagers.push({ name });
  }

  const fingerprint = {
    claude: {
      present: Boolean(claudeExecutable || metadata?.version || detectedAgents.has("claude")),
      version: commandVersion || metadata?.version || null,
      source: commandVersion ? "claude --version" : metadata?.source || null,
    },
    codex: {
      present: Boolean(codexExecutable || detectedAgents.has("codex")),
      version: codexVersion,
      source: codexVersion ? "codex --version" : detectedAgents.has("codex") ? "local logs" : null,
    },
    node: { version: process.versions.node },
    os: {
      platform: options.platform || platform(),
      release: options.release || release(),
      arch: options.arch || arch(),
    },
    package_managers: packageManagers,
    mcp_servers: configuredItems(mcpServers),
    plugins: configuredItems(plugins),
    scan_errors: errors,
  };

  fingerprint.dimensions = fingerprintDimensions(fingerprint);
  return fingerprint;
}

export const internals = {
  collectConfiguration,
  extractVersion,
  projectConfigPaths,
  displayPath,
};
