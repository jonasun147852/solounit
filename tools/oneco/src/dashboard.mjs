import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createAuditReport, redactCredentialValues } from "./audit.mjs";
import { createDoctorReport } from "./doctor.mjs";
import { createWalletReport } from "./wallet.mjs";

function dollars(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function localDisplayText(value) {
  return redactCredentialValues(String(value ?? ""))
    .replaceAll(/https:\/\//gi, "https:／／")
    .replaceAll(/http:\/\//gi, "http:／／")
    .replaceAll(/\/\/cdn/gi, "／／cdn")
    .replaceAll(/fetch\s*\(/gi, "fetch [");
}

function escapeHtml(value) {
  return localDisplayText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function barWidth(spend, total) {
  const numericSpend = Number(spend);
  const numericTotal = Number(total);
  if (!Number.isFinite(numericSpend) || !Number.isFinite(numericTotal) || numericTotal <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (numericSpend / numericTotal) * 100));
}

function doctorSeverity(advisory) {
  if (["critical", "warning", "info"].includes(advisory?.severity)) {
    return advisory.severity;
  }
  return advisory?.status === "withdrawn" ? "info" : "warning";
}

function doctorCard(report) {
  const advisories = Array.isArray(report?.advisories) ? report.advisories : [];
  const rows = advisories.length
    ? advisories
        .map((advisory) => {
          const severity = doctorSeverity(advisory);
          const fixes = Array.isArray(advisory.fix_steps)
            ? advisory.fix_steps
            : advisory.fix
              ? [advisory.fix]
              : [];
          const fixMarkup = fixes.length
            ? `<ol>${fixes.map((fix) => `<li>${escapeHtml(fix)}</li>`).join("")}</ol>`
            : '<p class="muted detail">No fix steps supplied.</p>';
          return `
            <article class="finding advisory severity-${severity}">
              <div class="finding-heading">
                <span class="severity-dot" aria-hidden="true"></span>
                <strong>${escapeHtml(advisory.id || "Advisory")}</strong>
                <span class="severity-label">${escapeHtml(severity)}</span>
              </div>
              <p>${escapeHtml(advisory.summary || "Matched this local environment.")}</p>
              <div class="fix"><span>Fix</span>${fixMarkup}</div>
            </article>`;
        })
        .join("")
    : '<div class="clear-state"><span aria-hidden="true">✓</span><p>No local advisories matched this environment.</p></div>';

  return `
    <section class="card doctor-card" aria-labelledby="doctor-title">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Environment health</p>
          <h2 id="doctor-title">Doctor（修理镜）</h2>
        </div>
        <span class="count-badge">${escapeHtml(report?.summary?.matched || 0)} matched</span>
      </div>
      <div class="finding-list">${rows}
      </div>
    </section>`;
}

function walletCard(report) {
  const total = Number(report?.summary?.total_spend_usd) || 0;
  const models = Array.isArray(report?.spend_by_model) ? report.spend_by_model : [];
  const modelRows = models.length
    ? models
        .map((model) => {
          const value = model.priced === false ? "Unpriced" : dollars(model.spend_usd);
          const width = barWidth(model.spend_usd, total).toFixed(2);
          return `
            <div class="model-row">
              <div class="row-meta"><span>${escapeHtml(model.model || "Unknown model")}</span><strong>${escapeHtml(value)}</strong></div>
              <div class="bar-track" role="img" aria-label="${escapeHtml(model.model || "Unknown model")}: ${escapeHtml(value)}">
                <span class="bar-fill" style="width:${width}%"></span>
              </div>
            </div>`;
        })
        .join("")
    : '<p class="muted empty">No usage-bearing turns found.</p>';
  const buckets = (Array.isArray(report?.waste_buckets) ? report.waste_buckets : []).slice(0, 3);
  const wasteRows = buckets.length
    ? buckets
        .map(
          (bucket) => `
            <div class="waste-row">
              <span>${escapeHtml(bucket.label || bucket.key || "Estimate")}</span>
              <strong>${escapeHtml(dollars(bucket.estimated_usd))}</strong>
            </div>`,
        )
        .join("")
    : '<p class="muted empty">No potential-savings estimates found.</p>';

  return `
    <section class="card wallet-card" aria-labelledby="wallet-title">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Cost visibility</p>
          <h2 id="wallet-title">Wallet（钱包镜）</h2>
        </div>
        <span class="count-badge">${escapeHtml(report?.window?.days || 30)} days</span>
      </div>
      <div class="usage-hero">
        <span>API-equivalent usage</span>
        <strong>${escapeHtml(dollars(total))}</strong>
        <p>What this usage would cost at API list prices — subscription users: this is what your plan absorbed, not your bill.</p>
      </div>
      <div class="wallet-sections">
        <div>
          <h3>Spend by model</h3>
          <div class="model-list">${modelRows}
          </div>
        </div>
        <div>
          <h3>Top waste buckets <span>estimates</span></h3>
          <div class="waste-list">${wasteRows}
          </div>
        </div>
      </div>
    </section>`;
}

function auditCard(report) {
  const summary = report?.summary || {};
  const findings = (Array.isArray(report?.findings) ? report.findings : []).filter(
    (entry) => entry.severity === "critical" || entry.severity === "warning",
  );
  const findingRows = findings.length
    ? findings
        .map(
          (finding) => `
            <article class="finding severity-${escapeHtml(finding.severity)}">
              <div class="finding-heading">
                <span class="severity-dot" aria-hidden="true"></span>
                <strong>${escapeHtml(finding.id || "Finding")}</strong>
                <span class="severity-label">${escapeHtml(finding.severity)}</span>
              </div>
              <p>${escapeHtml(finding.what || "Local audit finding")}</p>
              <dl>
                <div><dt>Where</dt><dd>${escapeHtml(finding.where || "Not specified")}</dd></div>
                <div><dt>Fix</dt><dd>${escapeHtml(finding.fix || "Review this local configuration.")}</dd></div>
              </dl>
            </article>`,
        )
        .join("")
    : `<div class="clear-state"><span aria-hidden="true">✓</span><p>${Number(summary.total) === 0 ? "All clear — no audit findings." : "No critical or warning findings."}</p></div>`;

  return `
    <section class="card audit-card" aria-labelledby="audit-title">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Local access review</p>
          <h2 id="audit-title">Audit（安全镜）</h2>
        </div>
        <span class="count-badge">${escapeHtml(summary.total || 0)} total</span>
      </div>
      <div class="traffic-strip" aria-label="${escapeHtml(summary.critical || 0)} critical, ${escapeHtml(summary.warning || 0)} warning, ${escapeHtml(summary.info || 0)} info findings">
        <div class="traffic critical"><span>${escapeHtml(summary.critical || 0)}</span><small>Critical</small></div>
        <div class="traffic warning"><span>${escapeHtml(summary.warning || 0)}</span><small>Warning</small></div>
        <div class="traffic info"><span>${escapeHtml(summary.info || 0)}</span><small>Info</small></div>
      </div>
      <div class="finding-list">${findingRows}
      </div>
    </section>`;
}

function cognitionCard(report) {
  if (!report) {
    return `
    <section class="card cognition-card" aria-labelledby="cognition-title">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Thinking patterns</p>
          <h2 id="cognition-title">Cognition（认知镜）</h2>
        </div>
        <span class="count-badge quiet">Coming soon</span>
      </div>
      <div class="placeholder">
        <div class="placeholder-mark" aria-hidden="true">◌</div>
        <p>The cognition mirror is not implemented yet. This space is reserved for its local summary.</p>
      </div>
    </section>`;
  }

  const summary = typeof report.summary === "string"
    ? report.summary
    : JSON.stringify(report.summary || {});
  return `
    <section class="card cognition-card" aria-labelledby="cognition-title">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Thinking patterns</p>
          <h2 id="cognition-title">Cognition（认知镜）</h2>
        </div>
        <span class="count-badge quiet">Local summary</span>
      </div>
      <div class="placeholder"><p>${escapeHtml(summary)}</p></div>
    </section>`;
}

export async function createDashboardReport(options = {}) {
  const now = options.now || new Date();
  const [doctor, wallet, audit] = await Promise.all([
    createDoctorReport({ ...options.doctorOptions, now: options.doctorOptions?.now || now }),
    createWalletReport({ ...options.walletOptions, now: options.walletOptions?.now || now }),
    createAuditReport({ ...options.auditOptions, now: options.auditOptions?.now || now }),
  ]);
  return {
    generated_at: now.toISOString(),
    privacy: "local-only",
    doctor,
    wallet,
    audit,
    cognition: options.cognition || null,
  };
}

export function renderDashboard(report) {
  const generatedAt = report?.generated_at || new Date().toISOString();
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>oneco — local health panel</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #0b0e12;
      --surface: #12171d;
      --surface-raised: #171d24;
      --surface-soft: #1c232c;
      --text: #f1f4f7;
      --muted: #94a0ad;
      --line: #29333e;
      --green: #64d9a7;
      --green-soft: rgba(100, 217, 167, 0.12);
      --red: #ff7c85;
      --amber: #edbd69;
      --blue: #79aee8;
      --shadow: rgba(0, 0, 0, 0.3);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      padding: 48px 22px 34px;
      background: var(--page);
      color: var(--text);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .shell { width: 100%; max-width: 1000px; margin: 0 auto; }
    .page-header { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 24px; margin-bottom: 24px; }
    .brand { margin: 0 0 6px; font-size: clamp(1.8rem, 4vw, 2.8rem); letter-spacing: -0.045em; line-height: 1.05; }
    .timestamp { margin: 0; color: var(--muted); font-size: 0.84rem; }
    .trust-badge {
      max-width: 410px;
      margin: 0;
      padding: 12px 15px;
      border: 1px solid rgba(100, 217, 167, 0.35);
      border-radius: 13px;
      background: var(--green-soft);
      color: var(--green);
      font-size: 0.82rem;
      font-weight: 700;
      text-align: center;
    }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
    .card { min-width: 0; padding: 24px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 18px 50px var(--shadow); }
    .card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
    .eyebrow { margin: 0 0 5px; color: var(--muted); font-size: 0.67rem; font-weight: 750; letter-spacing: 0.12em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.015em; }
    h3 { margin: 0 0 12px; color: var(--muted); font-size: 0.72rem; letter-spacing: 0.09em; text-transform: uppercase; }
    h3 span { font-weight: 500; letter-spacing: 0; text-transform: none; }
    .count-badge { flex: 0 0 auto; padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-raised); color: var(--muted); font-size: 0.7rem; font-weight: 700; }
    .count-badge.quiet { color: var(--blue); }
    .finding-list { display: grid; gap: 10px; }
    .finding { padding: 15px; border: 1px solid var(--line); border-left: 3px solid var(--amber); border-radius: 12px; background: var(--surface-raised); }
    .finding.severity-critical { border-left-color: var(--red); }
    .finding.severity-warning { border-left-color: var(--amber); }
    .finding.severity-info { border-left-color: var(--blue); }
    .finding-heading { display: flex; align-items: center; gap: 8px; }
    .finding-heading strong { min-width: 0; overflow: hidden; font-size: 0.78rem; text-overflow: ellipsis; white-space: nowrap; }
    .severity-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 999px; background: var(--amber); }
    .severity-critical .severity-dot { background: var(--red); }
    .severity-warning .severity-dot { background: var(--amber); }
    .severity-info .severity-dot { background: var(--blue); }
    .severity-label { margin-left: auto; color: var(--muted); font-size: 0.63rem; text-transform: uppercase; }
    .finding p { margin: 10px 0 0; color: var(--text); font-size: 0.82rem; }
    .fix { margin-top: 12px; color: var(--muted); font-size: 0.74rem; }
    .fix > span { font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
    .fix ol { margin: 5px 0 0; padding-left: 18px; }
    .fix li + li { margin-top: 4px; }
    .clear-state { display: flex; align-items: center; gap: 11px; padding: 15px; border: 1px solid rgba(100, 217, 167, 0.25); border-radius: 12px; background: var(--green-soft); color: var(--green); }
    .clear-state span { display: grid; width: 23px; height: 23px; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--green); color: var(--page); font-size: 0.78rem; font-weight: 900; }
    .clear-state p { margin: 0; font-size: 0.8rem; font-weight: 650; }
    .usage-hero { margin-bottom: 24px; padding: 18px; border: 1px solid rgba(100, 217, 167, 0.28); border-radius: 15px; background: var(--green-soft); }
    .usage-hero > span { display: block; color: var(--muted); font-size: 0.7rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
    .usage-hero > strong { display: block; margin: 5px 0 7px; color: var(--green); font-size: clamp(2.8rem, 7vw, 4.2rem); letter-spacing: -0.065em; line-height: 1; }
    .usage-hero p { margin: 0; color: var(--muted); font-size: 0.72rem; }
    .wallet-sections { display: grid; gap: 22px; }
    .model-list, .waste-list { display: grid; gap: 11px; }
    .row-meta, .waste-row { display: flex; justify-content: space-between; gap: 14px; font-size: 0.76rem; }
    .row-meta span, .waste-row span { min-width: 0; overflow: hidden; color: var(--muted); text-overflow: ellipsis; white-space: nowrap; }
    .row-meta strong, .waste-row strong { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
    .bar-track { height: 6px; margin-top: 6px; overflow: hidden; border-radius: 999px; background: var(--surface-soft); }
    .bar-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #3ba47d, var(--green)); }
    .waste-row { padding: 10px 11px; border-radius: 9px; background: var(--surface-raised); }
    .traffic-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .traffic { padding: 11px; border-radius: 11px; background: var(--surface-raised); text-align: center; }
    .traffic span { display: block; font-size: 1.45rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
    .traffic small { display: block; margin-top: 5px; color: var(--muted); font-size: 0.64rem; text-transform: uppercase; }
    .traffic.critical span { color: var(--red); }
    .traffic.warning span { color: var(--amber); }
    .traffic.info span { color: var(--blue); }
    dl { margin: 11px 0 0; }
    dl div { display: grid; grid-template-columns: 42px 1fr; gap: 6px; font-size: 0.72rem; }
    dl div + div { margin-top: 5px; }
    dt { color: var(--muted); font-weight: 700; }
    dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .placeholder { display: grid; min-height: 180px; place-content: center; justify-items: center; padding: 26px; border: 1px dashed var(--line); border-radius: 14px; background: var(--surface-raised); text-align: center; }
    .placeholder-mark { color: var(--blue); font-size: 2.5rem; line-height: 1; }
    .placeholder p { max-width: 320px; margin: 12px 0 0; color: var(--muted); font-size: 0.8rem; }
    .muted { color: var(--muted); }
    .empty { margin: 0; font-size: 0.78rem; }
    .detail { margin-top: 5px; }
    .page-footer { margin-top: 22px; color: var(--muted); font-size: 0.72rem; text-align: center; }
    @media (max-width: 760px) {
      body { padding: 30px 15px 24px; }
      .page-header { grid-template-columns: 1fr; align-items: start; }
      .trust-badge { max-width: none; text-align: left; }
      .grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 430px) {
      .card { padding: 19px; border-radius: 17px; }
      .card-heading { gap: 10px; }
      .traffic-strip { gap: 5px; }
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --page: #edf1f3;
        --surface: #ffffff;
        --surface-raised: #f5f7f8;
        --surface-soft: #e7ecef;
        --text: #17201f;
        --muted: #64716f;
        --line: #d8dfe1;
        --green: #087955;
        --green-soft: rgba(8, 121, 85, 0.08);
        --red: #be3948;
        --amber: #9a6617;
        --blue: #356fa8;
        --shadow: rgba(28, 45, 42, 0.09);
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="page-header">
      <div>
        <h1 class="brand">oneco — local health panel</h1>
        <p class="timestamp">Generated <time datetime="${escapeHtml(generatedAt)}">${escapeHtml(formatTimestamp(generatedAt))}</time></p>
      </div>
      <p class="trust-badge">Everything on this page was computed locally. Nothing left this machine.</p>
    </header>
    <div class="grid">
      ${doctorCard(report?.doctor)}
      ${walletCard(report?.wallet)}
      ${auditCard(report?.audit)}
      ${cognitionCard(report?.cognition)}
    </div>
    <footer class="page-footer">oneco local health panel · generated for this machine only</footer>
  </main>
</body>
</html>
`;
  return redactCredentialValues(html);
}

export function dashboardHtmlPath(path, options = {}) {
  const home = options.homeDirectory || homedir();
  const workingDirectory = options.cwd || process.cwd();
  if (!path) return join(home, ".oneco", "dashboard.html");
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolve(home, path.slice(2));
  return resolve(workingDirectory, path);
}

export async function writeDashboardHtml(report, path, options = {}) {
  const destination = dashboardHtmlPath(path, options);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, renderDashboard(report), { encoding: "utf8", mode: 0o600 });
  return destination;
}

function opener(platform, path) {
  if (platform === "darwin") return { command: "open", args: [path] };
  if (platform === "win32") {
    return {
      command: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", path],
    };
  }
  return { command: "xdg-open", args: [path] };
}

export async function openDashboard(path, options = {}) {
  const selected = opener(options.platform || process.platform, path);
  const execute = options.execFile || execFile;
  await new Promise((resolvePromise, rejectPromise) => {
    execute(selected.command, selected.args, (error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
}

export async function runDashboard(options = {}) {
  const output = options.output || process.stdout;
  const report = options.report || (await createDashboardReport(options));
  const destination = await writeDashboardHtml(report, options.out, options);
  output.write(`Dashboard written to ${destination}\n`);
  if (options.open) {
    await openDashboard(destination, options);
    output.write(`Opened ${destination}\n`);
  }
  return { destination, report };
}

export const internals = { barWidth, doctorSeverity, opener };
