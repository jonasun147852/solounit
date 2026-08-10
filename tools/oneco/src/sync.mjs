import {
  advisoryEndpointUrl,
  parseAdvisoryResponse,
  writeAdvisoryCache,
} from "./advisory-cache.mjs";
import { t } from "./i18n.mjs";

export async function syncAdvisories(options = {}) {
  const locale = options.locale || "en";
  const environment = options.environment ?? process.env;
  const baseUrl = options.url || environment.SOLOUNIT_HUB_URL || environment.ONECO_HUB_URL;
  if (!baseUrl) {
    throw new Error(t("sync.noUrl", { locale }));
  }

  const endpoint = advisoryEndpointUrl(baseUrl);
  const loader = options.loader || fetch;
  const response = await loader(endpoint.toString(), {
    headers: { accept: "application/json" },
  });
  if (response?.ok === false) {
    throw new Error(t("sync.httpFailure", { locale, status: response.status }));
  }

  let payload;
  try {
    payload = typeof response?.json === "function" ? await response.json() : response;
  } catch {
    throw new Error(t("sync.invalidJson", { locale }));
  }
  const advisories = parseAdvisoryResponse(payload);
  const cache = await (options.cacheWriter || writeAdvisoryCache)(advisories, {
    path: options.cachePath,
    homeDirectory: options.homeDirectory,
    now: options.now,
  });

  return {
    fetched: advisories.length,
    updatedAt: cache.updatedAt,
    cachePath: cache.path,
    endpoint: endpoint.toString(),
  };
}

export async function runSync(options = {}) {
  const result = await syncAdvisories(options);
  const output = options.output || process.stdout;
  const locale = options.locale || "en";
  output.write(`${t(result.fetched === 1 ? "sync.complete.one" : "sync.complete.other", {
    locale,
    count: result.fetched,
    updatedAt: result.updatedAt,
  })}\n`);
  return result;
}
