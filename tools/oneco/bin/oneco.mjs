#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAuditReport, runAudit } from "../src/audit.mjs";
import { runDashboard } from "../src/dashboard.mjs";
import { runDoctor } from "../src/doctor.mjs";
import { resolveLocale, setLocale, stripLocaleArgs, t } from "../src/i18n.mjs";
import { runSync } from "../src/sync.mjs";
import { runWallet } from "../src/wallet.mjs";

function parseOptions(args, allowed, locale = "en") {
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
      if (!options.html) throw new Error(t("cli.htmlPathEmpty", { locale }));
      continue;
    }
    if (argument === "--url" && allowed.has("url")) {
      index += 1;
      if (!args[index] || args[index].startsWith("--")) {
        throw new Error(t("cli.urlRequired", { locale }));
      }
      options.url = args[index];
      continue;
    }
    if (argument.startsWith("--url=") && allowed.has("url")) {
      options.url = argument.slice("--url=".length);
      if (!options.url) throw new Error(t("cli.urlRequired", { locale }));
      continue;
    }
    if (argument === "--out" && allowed.has("out")) {
      index += 1;
      if (!args[index] || args[index].startsWith("--")) {
        throw new Error(t("cli.outRequired", { locale }));
      }
      options.out = args[index];
      continue;
    }
    if (argument.startsWith("--out=") && allowed.has("out")) {
      options.out = argument.slice("--out=".length);
      if (!options.out) throw new Error(t("cli.outRequired", { locale }));
      continue;
    }
    if (argument === "--open" && allowed.has("open")) {
      options.open = true;
      continue;
    }
    throw new Error(t("cli.unknownOption", { locale, option: argument }));
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3_650) {
    throw new Error(t("cli.daysRange", { locale }));
  }
  if (options.json && options.html) {
    throw new Error(t("cli.outputConflict", { locale }));
  }
  return options;
}

export async function main(args = process.argv.slice(2), runtime = {}) {
  const output = runtime.output || process.stdout;
  const errorOutput = runtime.errorOutput || process.stderr;
  const environment = runtime.environment || runtime.env || process.env;
  let locale;

  try {
    locale = resolveLocale(args, environment);
  } catch (error) {
    locale = resolveLocale([], environment);
    setLocale(locale);
    errorOutput.write(`${error.message}\n\n${t("help.text", { locale })}`);
    return 1;
  }
  setLocale(locale);
  const [command = "help", ...commandArgs] = stripLocaleArgs(args);

  try {
    if (command === "help" || command === "--help" || command === "-h") {
      output.write(t("help.text", { locale }));
      return 0;
    }

    if (command === "doctor") {
      const options = parseOptions(commandArgs, new Set(["json"]), locale);
      await runDoctor({ ...runtime.doctorOptions, json: options.json, output, locale });
      return 0;
    }

    if (command === "audit") {
      const options = parseOptions(commandArgs, new Set(["json"]), locale);
      await runAudit({ ...runtime.auditOptions, json: options.json, output, locale });
      return 0;
    }

    if (command === "wallet") {
      const options = parseOptions(commandArgs, new Set(["json", "html", "days"]), locale);
      await runWallet({
        ...runtime.walletOptions,
        json: options.json,
        html: options.html,
        days: options.days,
        output,
        locale,
      });
      return 0;
    }

    if (command === "dashboard") {
      const options = parseOptions(commandArgs, new Set(["out", "open"]), locale);
      await runDashboard({
        ...runtime.dashboardOptions,
        doctorOptions: runtime.dashboardOptions?.doctorOptions || runtime.doctorOptions,
        walletOptions: runtime.dashboardOptions?.walletOptions || runtime.walletOptions,
        auditOptions: runtime.dashboardOptions?.auditOptions || runtime.auditOptions,
        out: options.out,
        open: options.open,
        output,
        locale,
      });
      return 0;
    }

    if (command === "graft") {
      const options = parseOptions(commandArgs, new Set(["days"]), locale);
      const doctor = await runDoctor({ ...runtime.doctorOptions, output, locale });
      output.write("\n");
      const wallet = await runWallet({
        ...runtime.walletOptions,
        days: options.days,
        output,
        locale,
      });
      const audit = await createAuditReport({ ...runtime.auditOptions, locale });
      const matched = doctor.summary?.matched || 0;
      const spend = wallet.summary?.total_spend_usd || 0;
      const waste = wallet.summary?.estimated_potential_waste_usd || 0;
      const auditTotal = audit.summary?.total || 0;
      const advisoryLabel = t(
        matched === 1 ? "graft.advisory.one" : "graft.advisory.other",
        { locale },
      );
      output.write(
        `\n${t("graft.complete", {
          locale,
          matched,
          advisoryLabel,
          spend: `$${spend.toFixed(2)}`,
          waste: `$${waste.toFixed(2)}`,
        })}\n`,
      );
      output.write(
        `\n${t("graft.auditSummary", {
          locale,
          mirror: t("mirror.audit", { locale }),
          critical: audit.summary.critical,
          warning: audit.summary.warning,
          info: audit.summary.info,
          ending: t(auditTotal > 0 ? "graft.auditDetails" : "graft.auditClear", { locale }),
        })}\n`,
      );
      output.write(`\n${t("graft.dashboardPrompt", { locale })}\n`);
      return 0;
    }

    if (command === "sync") {
      const options = parseOptions(commandArgs, new Set(["url"]), locale);
      await runSync({
        ...runtime.syncOptions,
        url: options.url ?? runtime.syncOptions?.url,
        output,
        locale,
      });
      return 0;
    }

    errorOutput.write(
      `${t("cli.unknownCommand", { locale, command })}\n\n${t("help.text", { locale })}`,
    );
    return 1;
  } catch (error) {
    errorOutput.write(`${error.message}\n\n${t("help.text", { locale })}`);
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) {
  process.exitCode = await main();
}

export const internals = { parseOptions };
