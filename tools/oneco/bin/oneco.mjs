#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAuditReport, redactCredentialValues, runAudit } from "../src/audit.mjs";
import { runDashboard } from "../src/dashboard.mjs";
import { createDoctorReport, renderDoctor, runDoctor } from "../src/doctor.mjs";
import { resolveLocale, setLocale, stripLocaleArgs, t } from "../src/i18n.mjs";
import { runSync } from "../src/sync.mjs";
import { createWalletReport, renderWallet, runWallet } from "../src/wallet.mjs";

function parseOptions(args, allowed, locale = "en") {
  const options = {
    json: false,
    html: null,
    days: 30,
    agent: null,
    url: null,
    out: null,
    open: false,
    debug: false,
  };
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
    if (argument === "--agent" && allowed.has("agent")) {
      index += 1;
      if (!args[index] || args[index].startsWith("--")) {
        throw new Error(t("cli.agentRequired", { locale }));
      }
      options.agent = args[index];
      continue;
    }
    if (argument.startsWith("--agent=") && allowed.has("agent")) {
      options.agent = argument.slice("--agent=".length);
      if (!options.agent) throw new Error(t("cli.agentRequired", { locale }));
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
    if (argument === "--debug" && allowed.has("debug")) {
      options.debug = true;
      continue;
    }
    throw new Error(t("cli.unknownOption", { locale, option: argument }));
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3_650) {
    throw new Error(t("cli.daysRange", { locale }));
  }
  if (options.agent && !["claude", "codex"].includes(options.agent)) {
    throw new Error(t("cli.agentInvalid", { locale }));
  }
  if (options.json && options.html) {
    throw new Error(t("cli.outputConflict", { locale }));
  }
  return options;
}

function oneLineReason(error, locale) {
  const reason = String(error?.message || error || t("graft.unknownError", { locale }))
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .slice(0, 240);
  return redactCredentialValues(reason || t("graft.unknownError", { locale }), locale);
}

function graftDebugLine(mirror, report, locale) {
  const diagnostics = report?.diagnostics || report?.fingerprint?.diagnostics || {};
  const directories = Array.isArray(diagnostics.directories_checked) &&
      diagnostics.directories_checked.length > 0
    ? diagnostics.directories_checked.join(", ")
    : t("graft.none", { locale });
  return t("graft.debug", {
    locale,
    mirror,
    directories,
    files: diagnostics.files_found ?? diagnostics.files_scanned ?? 0,
    parsed: diagnostics.lines_parsed || 0,
    skipped: diagnostics.lines_skipped ?? diagnostics.malformed_lines ?? 0,
  });
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
      const options = parseOptions(
        commandArgs,
        new Set(["json", "html", "days", "agent"]),
        locale,
      );
      await runWallet({
        ...runtime.walletOptions,
        json: options.json,
        html: options.html,
        days: options.days,
        agent: options.agent ?? runtime.walletOptions?.agent,
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
      const options = parseOptions(commandArgs, new Set(["days", "agent", "debug"]), locale);
      let doctor = null;
      try {
        doctor = await createDoctorReport({ ...runtime.doctorOptions, locale });
        output.write(`${renderDoctor(doctor, locale)}\n`);
      } catch (error) {
        output.write(
          `${t("mirror.doctor", { locale })}\n${t("graft.doctorError", {
            locale,
            reason: oneLineReason(error, locale),
          })}\n`,
        );
      }
      if (options.debug) {
        output.write(`${graftDebugLine(t("mirror.doctor", { locale }), doctor, locale)}\n`);
      }

      output.write("\n");
      let wallet = null;
      try {
        wallet = await createWalletReport({
          ...runtime.walletOptions,
          days: options.days,
          agent: options.agent ?? runtime.walletOptions?.agent,
          locale,
        });
        output.write(`${renderWallet(wallet, locale)}\n`);
      } catch (error) {
        output.write(
          `${t("mirror.wallet", { locale })}\n${t("graft.walletError", {
            locale,
            reason: oneLineReason(error, locale),
          })}\n`,
        );
      }
      if (options.debug) {
        output.write(`${graftDebugLine(t("mirror.wallet", { locale }), wallet, locale)}\n`);
      }

      let audit = null;
      let auditError = null;
      try {
        audit = await createAuditReport({ ...runtime.auditOptions, locale });
      } catch (error) {
        auditError = error;
      }

      const matched = doctor?.summary?.matched || 0;
      const spend = wallet?.summary?.total_spend_usd || 0;
      const waste = wallet?.summary?.estimated_potential_waste_usd || 0;
      const auditTotal = audit?.summary?.total || 0;
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
      output.write(`\n${t("mirror.audit", { locale })}\n`);
      if (audit) {
        output.write(
          `${t("graft.auditSummary", {
            locale,
            mirror: t("mirror.audit", { locale }),
            critical: audit.summary.critical,
            warning: audit.summary.warning,
            info: audit.summary.info,
            ending: t(auditTotal > 0 ? "graft.auditDetails" : "graft.auditClear", { locale }),
          })}\n`,
        );
        output.write(`${t(auditTotal > 0 ? "graft.auditReviewed" : "graft.auditReviewedClear", {
          locale,
          servers: audit.scope.mcp_servers || 0,
          files: audit.scope.config_files || 0,
          findings: auditTotal,
        })}\n`);
      } else {
        output.write(`${t("graft.auditError", {
          locale,
          reason: oneLineReason(auditError, locale),
        })}\n`);
      }
      if (options.debug) {
        output.write(`${graftDebugLine(t("mirror.audit", { locale }), audit, locale)}\n`);
      }
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
