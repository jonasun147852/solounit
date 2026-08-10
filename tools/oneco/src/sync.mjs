import {
  advisoryEndpointUrl,
  parseAdvisoryResponse,
  writeAdvisoryCache,
} from "./advisory-cache.mjs";

export async function syncAdvisories(options = {}) {
  const environment = options.environment ?? process.env;
  const baseUrl = options.url || environment.ONECO_HUB_URL;
  if (!baseUrl) {
    throw new Error(
      "No advisory hub URL is configured. Run `oneco sync --url http://localhost:8787` or set ONECO_HUB_URL.",
    );
  }

  const endpoint = advisoryEndpointUrl(baseUrl);
  const loader = options.loader || fetch;
  const response = await loader(endpoint.toString(), {
    headers: { accept: "application/json" },
  });
  if (response?.ok === false) {
    throw new Error(`Advisory sync failed with HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = typeof response?.json === "function" ? await response.json() : response;
  } catch {
    throw new Error("Advisory sync returned invalid JSON.");
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
  output.write(
    `Fetched ${result.fetched} advisor${result.fetched === 1 ? "y" : "ies"}. Advisory cache last updated ${result.updatedAt}.\n`,
  );
  return result;
}
