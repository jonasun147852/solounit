#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { createAuditReport, runAudit } from "../src/audit.mjs";
import { runDashboard } from "../src/dashboard.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { runSync } from "../src/sync.mjs";
import { runWallet } from "../src/wallet.mjs";

const HELP = `oneco — private mirrors for agent power-users

Usage:
  oneco doctor [--json]
  oneco audit [--json]
  oneco wallet [--days 30] [--json]
  oneco wallet [--days 30] --html [path]
  oneco dashboard [--out path] [--open]
  oneco graft [--days 30]
  oneco sync [--url http://localhost:8787]

Commands:
  doctor  Match this environment against bundled and cached advisories offline.
  audit   Review local agent access, hooks, credentials, and permissions offline.
  wallet  Report API-equivalent Claude Code usage and potential savings from local logs.
  dashboard  Render all local mirrors as a self-contained visual health panel.
  graft   Run doctor and wallet together for the first-run experience.
  sync    Explicitly fetch advisories and update the local cache.

Trust: only an explicit sync command can use the network. Doctor, audit, wallet, dashboard, and graft stay offline.
`;

function parseOptions(args, allowed) {
  const options = { json: false, html: null, days: 30, url: null, out: null, open: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json" && allowed.has("json")) {
      options.json = true;
      continue;
    }
    if (argument === "--days" && allowed.has("days")) {
      index += 1;
      options.days = Number(args[index]);
      continue;
    }
    if (argument.startsWith("--days=") && allowed.has("days")) {
      options.days = Number(argument.slice("--days=".length));
      continue;
    }
    if (argument === "--html" && allowed.has("html")) {
      const path = args[index + 1];
      if (path && !path.startsWith("--")) {
        options.html = path;
        index += 1;
      } else {
        options.html = true;
      }
      continue;
    }
    if (argument.startsWith("--html=") && allowed.has("html")) {
      options.html = argument.slice("--html=".length);
      if (!options.html) throw new Error("--html path cannot be empty");
      continue;
    }
    if (argument === "--url" && allowed.has("url")) {
      index += 1;
      if (!args[index] || args[index].startsWith("--")) {
        throw new Error("--url requires a value");
      }
      options.url = args[index];
      continue;
    }
    if (argument.startsWith("--url=") && allowed.has("url")) {
      options.url = argument.slice("--url=".length);
      if (!options.url) throw new Error("--url requires a value");
      continue;
    }
    if (argument === "--out" && allowed.has("out")) {
      index += 1;
      if (!args[index] || args[index].startsWith("--")) {
        throw new Error("--out requires a value");
      }
      options.out = args[index];
      continue;
    }
    if (argument.startsWith("--out=") && allowed.has("out")) {
      options.out = argument.slice("--out=".length);
      if (!options.out) throw new Error("--out requires a value");
      continue;
    }
    if (argument === "--open" && allowed.has("open")) {
      options.open = true;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3_650) {
    throw new Error("--days must be an integer from 1 to 3650");
  }
  if (options.json && options.html) {
    throw new Error("--json and --html cannot be used together");
  }
  return options;
}

export async function main(args = process.argv.slice(2), runtime = {}) {
  const output = runtime.output || process.stdout;
  const errorOutput = runtime.errorOutput || process.stderr;
  const [command = "help", ...commandArgs] = args;

  try {
    if (command === "help" || command === "--help" || command === "-h") {
      output.write(HELP);
      return 0;
    }

    if (command === "doctor") {
      const options = parseOptions(commandArgs, new Set(["json"]));
      await runDoctor({ ...runtime.doctorOptions, json: options.json, output });
      return 0;
    }

    if (command === "audit") {
      const options = parseOptions(commandArgs, new Set(["json"]));
      await runAudit({ ...runtime.auditOptions, json: options.json, output });
      return 0;
    }

    if (command === "wallet") {
      const options = parseOptions(commandArgs, new Set(["json", "html", "days"]));
      await runWallet({
        ...runtime.walletOptions,
        json: options.json,
        html: options.html,
        days: options.days,
        output,
      });
      return 0;
    }

    if (command === "dashboard") {
      const options = parseOptions(commandArgs, new Set(["out", "open"]));
      await runDashboard({
        ...runtime.dashboardOptions,
        doctorOptions: runtime.dashboardOptions?.doctorOptions || runtime.doctorOptions,
        walletOptions: runtime.dashboardOptions?.walletOptions || runtime.walletOptions,
        auditOptions: runtime.dashboardOptions?.auditOptions || runtime.auditOptions,
        out: options.out,
        open: options.open,
        output,
      });
      return 0;
    }

    if (command === "graft") {
      const options = parseOptions(commandArgs, new Set(["days"]));
      const doctor = await runDoctor({ ...runtime.doctorOptions, output });
      output.write("\n");
      const wallet = await runWallet({
        ...runtime.walletOptions,
        days: options.days,
        output,
      });
      const audit = await createAuditReport(runtime.auditOptions);
      const matched = doctor.summary?.matched || 0;
      const spend = wallet.summary?.total_spend_usd || 0;
      const waste = wallet.summary?.estimated_potential_waste_usd || 0;
      const auditTotal = audit.summary?.total || 0;
      output.write(
        `\nGraft complete: Doctor matched ${matched} local setup advisor${matched === 1 ? "y" : "ies"}. Wallet reports $${spend.toFixed(2)} in API-equivalent usage and up to $${waste.toFixed(2)} in potential savings if optimized; all analysis stayed on this machine.\n`,
      );
      output.write(
        `\nAudit（安全镜） — ${audit.summary.critical} critical, ${audit.summary.warning} warning, ${audit.summary.info} info.${auditTotal > 0 ? " Run oneco audit for detail." : " No findings."}\n`,
      );
      output.write('\nRun `oneco dashboard --open` to see all of this as a visual panel.\n');
      return 0;
    }

    if (command === "sync") {
      const options = parseOptions(commandArgs, new Set(["url"]));
      await runSync({
        ...runtime.syncOptions,
        url: options.url ?? runtime.syncOptions?.url,
        output,
      });
      return 0;
    }

    errorOutput.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    errorOutput.write(`${error.message}\n\n${HELP}`);
    return 1;
  }
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  process.exitCode = await main();
}

export const internals = { parseOptions };
