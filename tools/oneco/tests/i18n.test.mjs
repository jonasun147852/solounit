import assert from "node:assert/strict";
import test from "node:test";
import { main } from "../bin/oneco.mjs";
import { renderDashboard } from "../src/dashboard.mjs";
import { renderDoctor } from "../src/doctor.mjs";
import { resolveLocale, t } from "../src/i18n.mjs";
import { renderWallet, renderWalletHtml } from "../src/wallet.mjs";

const CJK = /[\u3400-\u9fff]/u;

const doctorReport = {
  mirror: "doctor",
  fingerprint: {
    claude: { version: "2.1.201" },
    node: { version: "26.0.0" },
    os: { platform: "darwin", arch: "arm64" },
    scan_errors: [],
  },
  summary: { advisories_scanned: 0, matched: 0 },
  advisories: [],
};

const walletReport = {
  mirror: "wallet",
  window: {
    days: 30,
    from: "2026-07-10T12:00:00.000Z",
    to: "2026-08-09T12:00:00.000Z",
  },
  summary: {
    assistant_turns: 0,
    sessions: 0,
    total_spend_usd: 0,
    estimated_potential_waste_usd: 0,
    unpriced_tokens: 0,
    estimate_note:
      "Potential-savings figures are overlapping heuristics, not billing facts; the combined estimate is capped at API-equivalent usage.",
  },
  spend_by_model: [],
  waste_buckets: [],
};

const dashboardReport = {
  generated_at: "2026-08-09T12:00:00.000Z",
  doctor: doctorReport,
  wallet: walletReport,
  audit: {
    summary: { critical: 0, warning: 0, info: 0, total: 0 },
    findings: [],
  },
  cognition: null,
};

test("locale resolution follows flag, SoloUnit env aliases, system locale, and default precedence", () => {
  assert.equal(
    resolveLocale(["doctor", "--lang", "en"], {
      SOLOUNIT_LANG: "zh",
      LC_ALL: "zh_CN.UTF-8",
    }),
    "en",
  );
  assert.equal(resolveLocale(["--lang=zh", "doctor"], { SOLOUNIT_LANG: "en" }), "zh");
  assert.equal(resolveLocale([], { SOLOUNIT_LANG: "zh", ONECO_LANG: "en" }), "zh");
  assert.equal(resolveLocale([], { SOLOUNIT_LANG: "en", ONECO_LANG: "zh" }), "en");
  assert.equal(resolveLocale([], { ONECO_LANG: "zh", LANG: "en_US.UTF-8" }), "zh");
  assert.equal(resolveLocale([], { ONECO_LANG: "en", LANG: "zh_CN.UTF-8" }), "en");
  assert.equal(resolveLocale([], { LC_ALL: "zh_CN.UTF-8", LANG: "en_US.UTF-8" }), "zh");
  assert.equal(resolveLocale([], { LC_MESSAGES: "zh_TW.UTF-8", LANG: "en_US.UTF-8" }), "zh");
  assert.equal(resolveLocale([], { LANG: "zh_CN.UTF-8" }), "zh");
  assert.equal(resolveLocale([], { LANG: "en_US.UTF-8" }), "en");
  assert.equal(resolveLocale([], {}), "en");
  assert.throws(() => resolveLocale(["--lang", "fr"], {}), /en or zh/);
});

test("translations interpolate parameters", () => {
  assert.equal(t("dashboard.days", { locale: "en", count: 7 }), "7 days");
  assert.equal(t("dashboard.days", { locale: "zh", count: 7 }), "7 天");
});

test("help follows the environment locale and the flag overrides it", async () => {
  const chineseOutput = { value: "", write(chunk) { this.value += chunk; } };
  const englishOutput = { value: "", write(chunk) { this.value += chunk; } };

  assert.equal(
    await main([], { output: chineseOutput, environment: { LANG: "zh_CN.UTF-8" } }),
    0,
  );
  assert.match(chineseOutput.value, /用法：/);

  assert.equal(
    await main(["--lang", "en"], {
      output: englishOutput,
      environment: { SOLOUNIT_LANG: "zh" },
    }),
    0,
  );
  assert.match(englishOutput.value, /Usage:/);
  assert.match(englishOutput.value, /SoloUnit — private mirrors/);
  assert.match(chineseOutput.value, /SoloUnit — 面向智能体高级用户/);
  assert.doesNotMatch(englishOutput.value, CJK);
});

test("doctor and wallet terminal chrome is English-only or uses localized mirror names", () => {
  const englishDoctor = renderDoctor(doctorReport, "en");
  const englishWallet = renderWallet(walletReport, "en");
  const chineseDoctor = renderDoctor(doctorReport, "zh");
  const chineseWallet = renderWallet(
    {
      ...walletReport,
      summary: {
        ...walletReport.summary,
        estimate_note: t("wallet.estimateNote", { locale: "zh" }),
      },
    },
    "zh",
  );

  assert.doesNotMatch(englishDoctor, CJK);
  assert.doesNotMatch(englishWallet, CJK);
  assert.match(chineseDoctor, /修理镜 · Doctor/);
  assert.match(chineseWallet, /钱包镜 · Wallet/);
});

test("dashboard and wallet card set the HTML language and localize mirror chrome", () => {
  const englishDashboard = renderDashboard(dashboardReport, "en");
  const chineseDashboard = renderDashboard(dashboardReport, "zh");
  const englishWallet = renderWalletHtml(walletReport, "en");
  const chineseWallet = renderWalletHtml(walletReport, "zh");

  assert.match(englishDashboard, /<html lang="en">/);
  assert.doesNotMatch(englishDashboard, CJK);
  assert.match(chineseDashboard, /<html lang="zh">/);
  assert.match(chineseDashboard, /修理镜 · Doctor/);
  assert.match(chineseDashboard, /钱包镜 · Wallet/);
  assert.match(chineseDashboard, /安全镜 · Audit/);
  assert.match(chineseDashboard, /认知镜 · Cognition/);
  assert.match(englishDashboard, /SoloUnit — local health panel/);
  assert.match(chineseDashboard, /SoloUnit — 本地健康面板/);
  assert.match(englishWallet, /<html lang="en">/);
  assert.doesNotMatch(englishWallet, CJK);
  assert.match(chineseWallet, /<html lang="zh">/);
  assert.match(chineseWallet, /API 等效用量/);
  assert.match(chineseWallet, /钱包镜 · Wallet/);
  assert.match(englishWallet, /generated locally by SoloUnit/);
  assert.match(chineseWallet, /由 SoloUnit 在本地生成/);
});
