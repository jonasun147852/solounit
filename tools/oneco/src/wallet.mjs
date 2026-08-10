import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  addUsage,
  emptyUsage,
  parseClaudeLogs,
  totalTokenCount,
} from "./claude-logs.mjs";

const DEFAULT_PRICING_URL = new URL("./pricing.json", import.meta.url);
const MILLION = 1_000_000;
const RETRY_WINDOW_MS = 2 * 60 * 1_000;
const RETRY_COST_LOOKAROUND_MS = 5 * 60 * 1_000;
const WALLET_FRAMING = Object.freeze({
  usage_label: "API-equivalent usage",
  usage_explainer:
    "What this usage would cost at API list prices — subscription users: this is what your plan absorbed, not your bill.",
  savings_label: "Potential savings if optimized",
});

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export async function loadPricing(pricingUrl = DEFAULT_PRICING_URL) {
  return JSON.parse(await readFile(pricingUrl, "utf8"));
}

export function modelPrice(model, pricing) {
  if (typeof model !== "string" || model.length === 0) return null;
  if (pricing.models[model]) return pricing.models[model];
  const alias = Object.keys(pricing.models)
    .sort((left, right) => right.length - left.length)
    .find((name) => model.startsWith(`${name}-`));
  return alias ? pricing.models[alias] : null;
}

export function priceUsage(usage, price) {
  if (!price) {
    return {
      priced: false,
      total_usd: 0,
      input_side_usd: 0,
      output_usd: 0,
      unpriced_tokens: totalTokenCount(usage),
    };
  }

  const baseInput = (usage.input_tokens * price.input) / MILLION;
  const cacheRead = (usage.cache_read_input_tokens * price.cache_read) / MILLION;
  const cacheWriteFive =
    (usage.cache_write_5m_input_tokens * price.cache_write_5m) / MILLION;
  const cacheWriteHour =
    (usage.cache_write_1h_input_tokens * price.cache_write_1h) / MILLION;
  const output = (usage.output_tokens * price.output) / MILLION;
  const inputSide = baseInput + cacheRead + cacheWriteFive + cacheWriteHour;

  return {
    priced: true,
    total_usd: inputSide + output,
    input_side_usd: inputSide,
    output_usd: output,
    unpriced_tokens: 0,
    components: {
      input_usd: baseInput,
      cache_read_usd: cacheRead,
      cache_write_5m_usd: cacheWriteFive,
      cache_write_1h_usd: cacheWriteHour,
      output_usd: output,
    },
  };
}

function quantile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function groupBySession(entries) {
  const sessions = new Map();
  for (const entry of entries) {
    if (!sessions.has(entry.session_id)) sessions.set(entry.session_id, []);
    sessions.get(entry.session_id).push(entry);
  }
  return sessions;
}

function enrichedTurns(turns, pricing) {
  return turns.map((turn) => {
    const price = modelPrice(turn.model, pricing);
    return { ...turn, price, cost: priceUsage(turn.usage, price) };
  });
}

function spendSummary(turns, pricing) {
  const models = new Map();
  let totalUsage = emptyUsage();
  let totalSpend = 0;
  let unpricedTokens = 0;

  for (const turn of turns) {
    if (!models.has(turn.model)) {
      models.set(turn.model, {
        model: turn.model,
        turns: 0,
        usage: emptyUsage(),
        spend_usd: 0,
        unpriced_tokens: 0,
        priced: Boolean(modelPrice(turn.model, pricing)),
      });
    }
    const model = models.get(turn.model);
    const cost = priceUsage(turn.usage, modelPrice(turn.model, pricing));
    model.turns += 1;
    model.usage = addUsage(model.usage, turn.usage);
    model.spend_usd += cost.total_usd;
    model.unpriced_tokens += cost.unpriced_tokens;
    totalUsage = addUsage(totalUsage, turn.usage);
    totalSpend += cost.total_usd;
    unpricedTokens += cost.unpriced_tokens;
  }

  const byModel = [...models.values()]
    .map((model) => ({
      ...model,
      spend_usd: model.priced ? round(model.spend_usd) : null,
      total_tokens: totalTokenCount(model.usage),
    }))
    .sort((left, right) => (right.spend_usd || 0) - (left.spend_usd || 0));

  return {
    total_spend_usd: round(totalSpend),
    total_usage: totalUsage,
    total_tokens: totalTokenCount(totalUsage),
    unpriced_tokens: unpricedTokens,
    by_model: byModel,
  };
}

function nearestPricedTurn(turns, timestamp) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const turn of turns) {
    if (!turn.cost.priced) continue;
    const distance = Math.abs(turn.timestamp - timestamp);
    if (distance <= RETRY_COST_LOOKAROUND_MS && distance < nearestDistance) {
      nearest = turn;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function detectRetryStorms(retries, turns, pricing) {
  const retriesBySession = groupBySession(retries);
  const turnsBySession = groupBySession(enrichedTurns(turns, pricing));
  const storms = [];

  for (const [sessionId, sessionRetries] of retriesBySession) {
    const sorted = [...sessionRetries].sort((left, right) => left.timestamp - right.timestamp);
    let burst = [];
    const flush = () => {
      if (burst.length < 2) {
        burst = [];
        return;
      }

      const sessionTurns = turnsBySession.get(sessionId) || [];
      let estimatedCost = 0;
      let directlyPriced = 0;
      for (const retry of burst) {
        const nearby = nearestPricedTurn(sessionTurns, retry.timestamp);
        const price = modelPrice(retry.model, pricing) || nearby?.price || null;
        if (retry.usage && price) {
          estimatedCost += priceUsage(retry.usage, price).total_usd;
          directlyPriced += 1;
        } else if (nearby) {
          estimatedCost += nearby.cost.input_side_usd;
        }
      }

      storms.push({
        attempts: burst.length,
        started_at: new Date(burst[0].timestamp).toISOString(),
        ended_at: new Date(burst.at(-1).timestamp).toISOString(),
        estimated_usd: estimatedCost,
        directly_priced_attempts: directlyPriced,
      });
      burst = [];
    };

    for (const retry of sorted) {
      if (burst.length > 0 && retry.timestamp - burst.at(-1).timestamp > RETRY_WINDOW_MS) {
        flush();
      }
      burst.push(retry);
    }
    flush();
  }

  return {
    storms,
    attempts: storms.reduce((sum, storm) => sum + storm.attempts, 0),
    estimated_usd: storms.reduce((sum, storm) => sum + storm.estimated_usd, 0),
  };
}

export function estimateContextBloat(turns, pricing) {
  const pricedTurns = enrichedTurns(turns, pricing).filter(
    (turn) => turn.cost.priced && turn.input_tokens > 0,
  );
  if (pricedTurns.length === 0) {
    return { sessions: 0, estimated_usd: 0, median_tokens: 0, p90_tokens: 0 };
  }

  const sessions = groupBySession(pricedTurns);
  const sessionAverages = [...sessions.entries()].map(([sessionId, sessionTurns]) => ({
    session_id: sessionId,
    turns: sessionTurns,
    average: sessionTurns.reduce((sum, turn) => sum + turn.input_tokens, 0) / sessionTurns.length,
  }));
  const medianTokens = quantile(
    pricedTurns.map((turn) => turn.input_tokens),
    0.5,
  );
  const p90Tokens = quantile(
    sessionAverages.map((session) => session.average),
    0.9,
  );
  const bloated = sessionAverages.filter((session) => session.average >= p90Tokens);
  let estimatedCost = 0;

  for (const session of bloated) {
    for (const turn of session.turns) {
      const excessTokens = Math.max(0, turn.input_tokens - medianTokens);
      const effectiveInputRate = turn.cost.input_side_usd / turn.input_tokens;
      estimatedCost += excessTokens * effectiveInputRate;
    }
  }

  return {
    sessions: bloated.length,
    estimated_usd: estimatedCost,
    median_tokens: medianTokens,
    p90_tokens: p90Tokens,
  };
}

export function estimateTierMismatch(turns, pricing) {
  const prices = Object.values(pricing.models);
  const largestTier = Math.max(...prices.map((price) => price.tier || 0));
  const fallbackPrice = prices
    .filter((price) => (price.tier || 0) < largestTier)
    .sort((left, right) => (right.tier || 0) - (left.tier || 0))[0];
  if (!fallbackPrice) return { sessions: 0, turns: 0, estimated_usd: 0 };

  const sessions = groupBySession(enrichedTurns(turns, pricing));
  let flaggedSessions = 0;
  let flaggedTurns = 0;
  let estimatedCost = 0;

  for (const sessionTurns of sessions.values()) {
    if (sessionTurns.length < 10) continue;
    const trivialLargestTurns = sessionTurns.filter(
      (turn) =>
        turn.price?.tier === largestTier &&
        turn.only_tool_calls &&
        turn.usage.output_tokens <= 500,
    );
    if (trivialLargestTurns.length < 5 || trivialLargestTurns.length / sessionTurns.length < 0.5) {
      continue;
    }

    flaggedSessions += 1;
    flaggedTurns += trivialLargestTurns.length;
    for (const turn of trivialLargestTurns) {
      const actual = turn.cost.total_usd;
      const fallback = priceUsage(turn.usage, fallbackPrice).total_usd;
      estimatedCost += Math.max(0, actual - fallback);
    }
  }

  return {
    sessions: flaggedSessions,
    turns: flaggedTurns,
    estimated_usd: estimatedCost,
  };
}

function wasteBuckets(logs, pricing) {
  const retry = detectRetryStorms(logs.retries, logs.turns, pricing);
  const context = estimateContextBloat(logs.turns, pricing);
  const tier = estimateTierMismatch(logs.turns, pricing);

  return [
    {
      key: "retry_storms",
      label: "Retry storms (estimate)",
      estimated_usd: round(retry.estimated_usd),
      evidence: `${retry.storms.length} burst(s), ${retry.attempts} retry record(s) within two-minute windows.`,
      fix: "Pause after repeated API errors and resume with one request after recovery.",
    },
    {
      key: "context_bloat",
      label: "Context bloat (estimate)",
      estimated_usd: round(context.estimated_usd),
      evidence: `${context.sessions} top-decile session(s); median ${Math.round(context.median_tokens).toLocaleString("en-US")} vs P90 ${Math.round(context.p90_tokens).toLocaleString("en-US")} input tokens/turn.`,
      fix: "Start a fresh session or compact before repeatedly carrying oversized context.",
    },
    {
      key: "tier_mismatch",
      label: "Tier mismatch (estimate)",
      estimated_usd: round(tier.estimated_usd),
      evidence: `${tier.turns} short tool-call turn(s) in ${tier.sessions} long session(s) used the largest priced tier.`,
      fix: "Route repetitive, low-output tool work to the next smaller model tier.",
    },
  ].sort((left, right) => right.estimated_usd - left.estimated_usd);
}

export async function createWalletReport(options = {}) {
  const now = options.now || new Date();
  const days = options.days || 30;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);
  const pricing = options.pricing || (await loadPricing(options.pricingUrl));
  const logs =
    options.logs ||
    (await parseClaudeLogs({
      logRoot: options.logRoot,
      since,
      until: now,
    }));
  const spend = spendSummary(logs.turns, pricing);
  const buckets = wasteBuckets(logs, pricing);
  const bucketTotal = buckets.reduce((sum, bucket) => sum + bucket.estimated_usd, 0);

  return {
    mirror: "wallet",
    generated_at: now.toISOString(),
    privacy: "local-only",
    framing: { ...WALLET_FRAMING },
    window: {
      days,
      from: since.toISOString(),
      to: now.toISOString(),
    },
    pricing: {
      currency: pricing.currency,
      published_as_of: pricing.published_as_of,
      source: pricing.source,
    },
    summary: {
      sessions: new Set(logs.turns.map((turn) => turn.session_id)).size,
      assistant_turns: logs.turns.length,
      total_spend_usd: spend.total_spend_usd,
      estimated_potential_waste_usd: round(
        Math.min(spend.total_spend_usd, bucketTotal),
      ),
      unpriced_tokens: spend.unpriced_tokens,
      estimate_note:
        "Potential-savings figures are overlapping heuristics, not billing facts; the combined estimate is capped at API-equivalent usage.",
    },
    total_usage: spend.total_usage,
    spend_by_model: spend.by_model,
    waste_buckets: buckets,
    diagnostics: logs.diagnostics,
  };
}

function dollars(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPeriodDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
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

export function renderWallet(report) {
  const lines = [
    "Wallet（钱包镜）",
    "Local-only cost report — transcript content is never printed or transmitted.",
    `Last ${report.window.days} day(s): ${report.summary.assistant_turns.toLocaleString("en-US")} assistant turns across ${report.summary.sessions.toLocaleString("en-US")} sessions.`,
    `${WALLET_FRAMING.usage_label}: ${dollars(report.summary.total_spend_usd)}.`,
    WALLET_FRAMING.usage_explainer,
  ];

  if (report.summary.unpriced_tokens > 0) {
    lines.push(
      `${report.summary.unpriced_tokens.toLocaleString("en-US")} tokens used unknown models and remain unpriced.`,
    );
  }

  lines.push("", "Spend by model:");
  if (report.spend_by_model.length === 0) lines.push("  No usage-bearing turns found.");
  for (const model of report.spend_by_model) {
    const price = model.priced ? dollars(model.spend_usd) : "unpriced";
    lines.push(
      `  ${model.model}: ${price} · ${model.total_tokens.toLocaleString("en-US")} tokens · ${model.turns.toLocaleString("en-US")} turns`,
    );
  }

  lines.push("", "Top waste buckets (all estimates; buckets can overlap):");
  for (const bucket of report.waste_buckets) {
    lines.push(
      `  ${bucket.label}: ${dollars(bucket.estimated_usd)} — ${bucket.evidence}`,
      `    Fix: ${bucket.fix}`,
    );
  }
  lines.push(
    "",
    `${WALLET_FRAMING.savings_label} (capped at API-equivalent usage): ${dollars(report.summary.estimated_potential_waste_usd)}.`,
    report.summary.estimate_note,
  );
  return lines.join("\n");
}

export function renderWalletHtml(report) {
  const total = Number(report.summary.total_spend_usd) || 0;
  const modelRows = report.spend_by_model.length
    ? report.spend_by_model
        .map((model) => {
          const price = model.priced ? dollars(model.spend_usd) : "Unpriced";
          const width = barWidth(model.spend_usd, total).toFixed(2);
          return `
          <div class="model-row">
            <div class="model-meta">
              <span class="model-name">${escapeHtml(model.model)}</span>
              <span class="model-value">${escapeHtml(price)}</span>
            </div>
            <div class="bar-track" role="img" aria-label="${escapeHtml(model.model)}: ${escapeHtml(price)}">
              <span class="bar-fill" style="width: ${width}%"></span>
            </div>
          </div>`;
        })
        .join("")
    : '<p class="empty">No usage-bearing turns found.</p>';
  const wasteCards = report.waste_buckets
    .map(
      (bucket) => `
        <div class="waste-card">
          <span class="waste-label">${escapeHtml(bucket.label)}</span>
          <strong>${escapeHtml(dollars(bucket.estimated_usd))}</strong>
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>oneco wallet card</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #090b10;
      --card: #11151d;
      --panel: #181e29;
      --text: #f4f7fb;
      --muted: #9ca8b9;
      --line: #293344;
      --accent: #8cf0c8;
      --accent-strong: #54d9a7;
      --accent-soft: rgba(140, 240, 200, 0.13);
      --shadow: rgba(0, 0, 0, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 32px 18px;
      background: var(--page);
      color: var(--text);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: 100%;
      max-width: 680px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--card);
      box-shadow: 0 28px 80px var(--shadow);
    }
    .content { padding: 40px 44px 34px; }
    .eyebrow, .section-title, .hero-label {
      margin: 0;
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 750;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .period { margin: 8px 0 0; color: var(--muted); font-size: 0.94rem; }
    .hero {
      margin: 34px 0 38px;
      padding: 28px 30px;
      border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line));
      border-radius: 22px;
      background: var(--accent-soft);
    }
    .hero-number {
      display: block;
      margin: 7px 0 8px;
      color: var(--accent);
      font-size: clamp(4rem, 15vw, 6.8rem);
      font-weight: 820;
      letter-spacing: -0.07em;
      line-height: 0.95;
    }
    .hero-note { max-width: 560px; margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
    .section + .section { margin-top: 34px; }
    .models { margin-top: 18px; display: grid; gap: 16px; }
    .model-meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 7px; }
    .model-name { min-width: 0; overflow: hidden; color: var(--text); font-size: 0.88rem; text-overflow: ellipsis; white-space: nowrap; }
    .model-value { flex: 0 0 auto; color: var(--muted); font-size: 0.88rem; font-variant-numeric: tabular-nums; }
    .bar-track { height: 9px; overflow: hidden; border-radius: 999px; background: var(--panel); }
    .bar-fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-strong), var(--accent)); }
    .waste-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .waste-card { min-width: 0; padding: 17px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
    .waste-label { display: block; min-height: 2.7em; color: var(--muted); font-size: 0.78rem; line-height: 1.35; }
    .waste-card strong { display: block; margin-top: 12px; color: var(--text); font-size: 1.35rem; font-variant-numeric: tabular-nums; }
    .savings { margin: 18px 0 0; color: var(--muted); font-size: 0.86rem; line-height: 1.45; }
    .savings strong { color: var(--text); }
    .empty { margin: 18px 0 0; color: var(--muted); }
    footer { padding: 18px 44px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.76rem; letter-spacing: 0.02em; }
    @media (max-width: 560px) {
      .content { padding: 30px 24px 28px; }
      .hero { padding: 24px 22px; }
      .waste-grid { grid-template-columns: 1fr; }
      .waste-label { min-height: 0; }
      footer { padding: 17px 24px; }
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --page: #eef2f5;
        --card: #ffffff;
        --panel: #f3f6f7;
        --text: #15201d;
        --muted: #5d6d68;
        --line: #d9e1df;
        --accent: #087a58;
        --accent-strong: #13966e;
        --accent-soft: rgba(19, 150, 110, 0.09);
        --shadow: rgba(31, 54, 47, 0.13);
      }
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="content">
      <header>
        <p class="eyebrow">oneco wallet</p>
        <p class="period">Last ${escapeHtml(report.window.days)} days · ${escapeHtml(formatPeriodDate(report.window.from))} – ${escapeHtml(formatPeriodDate(report.window.to))}</p>
      </header>
      <section class="hero" aria-labelledby="usage-label">
        <p class="hero-label" id="usage-label">${escapeHtml(WALLET_FRAMING.usage_label)}</p>
        <strong class="hero-number">${escapeHtml(dollars(total))}</strong>
        <p class="hero-note">${escapeHtml(WALLET_FRAMING.usage_explainer)}</p>
      </section>
      <section class="section" aria-labelledby="models-label">
        <h2 class="section-title" id="models-label">Spend by model</h2>
        <div class="models">${modelRows}
        </div>
      </section>
      <section class="section" aria-labelledby="waste-label">
        <h2 class="section-title" id="waste-label">Waste buckets · estimates</h2>
        <div class="waste-grid">${wasteCards}
        </div>
        <p class="savings"><strong>${escapeHtml(WALLET_FRAMING.savings_label)}:</strong> ${escapeHtml(dollars(report.summary.estimated_potential_waste_usd))}</p>
      </section>
    </div>
    <footer>generated locally by oneco — nothing left this machine</footer>
  </main>
</body>
</html>
`;
}

export function walletHtmlPath(path, options = {}) {
  const home = options.homeDirectory || homedir();
  const workingDirectory = options.cwd || process.cwd();
  if (!path) return join(home, ".oneco", "wallet-card.html");
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolve(home, path.slice(2));
  return resolve(workingDirectory, path);
}

export async function writeWalletHtml(report, path, options = {}) {
  const destination = walletHtmlPath(path, options);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, renderWalletHtml(report), { encoding: "utf8", mode: 0o600 });
  return destination;
}

export async function runWallet(options = {}) {
  const output = options.output || process.stdout;
  try {
    const report = await createWalletReport(options);
    if (options.html) {
      const path = await writeWalletHtml(
        report,
        typeof options.html === "string" ? options.html : undefined,
        options,
      );
      output.write(`Wallet card written to ${path}\n`);
    } else {
      output.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderWallet(report)}\n`);
    }
    return report;
  } catch {
    const report = {
      mirror: "wallet",
      generated_at: (options.now || new Date()).toISOString(),
      privacy: "local-only",
      framing: { ...WALLET_FRAMING },
      error: "The local wallet report could not be completed.",
    };
    output.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${report.error}\n`);
    return report;
  }
}

export const internals = {
  quantile,
  round,
  spendSummary,
  wasteBuckets,
};
