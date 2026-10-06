#!/usr/bin/env bash

set -euo pipefail

readonly EXPECTED_REPOSITORY="jonasun147852/solounit"
readonly EXPECTED_WORKFLOW="publish.yml"
readonly PACKAGE_JSON="tools/oneco/package.json"
readonly NPM_REGISTRY="https://registry.npmjs.org"
readonly NPM_OIDC_AUDIENCE="npm:registry.npmjs.org"
readonly CONFIGURE_MESSAGE='去 npmjs.com → 包 Settings → 配 trusted publisher（`jonasun147852/solounit` + `publish.yml`），否则这次 CI 会以 404 的形式失败'

fail() {
  printf 'preflight-publish: %s\n' "$1" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v node >/dev/null 2>&1 || fail "node is required"

[[ "${GITHUB_REPOSITORY:-}" == "$EXPECTED_REPOSITORY" ]] ||
  fail "expected GitHub repository $EXPECTED_REPOSITORY"
[[ "${GITHUB_WORKFLOW_REF:-}" == "$EXPECTED_REPOSITORY/.github/workflows/$EXPECTED_WORKFLOW@"* ]] ||
  fail "expected workflow .github/workflows/$EXPECTED_WORKFLOW"
[[ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]] ||
  fail "GitHub OIDC request URL is unavailable; check permissions.id-token: write"
[[ -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]] ||
  fail "GitHub OIDC request token is unavailable; check permissions.id-token: write"

package_name="$({
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof manifest.name !== "string" || manifest.name.length === 0) process.exit(1);
    process.stdout.write(manifest.name);
  ' "$PACKAGE_JSON"
} 2>/dev/null)" || fail "could not read the package name from $PACKAGE_JSON"

[[ "$package_name" == "solounit" ]] || fail "expected package solounit, found $package_name"

npm_version="$(npm --version)" || fail "could not determine the npm version"
node -e '
  const [major = 0, minor = 0, patch = 0] = process.argv[1].split(".").map(Number);
  if (major < 11 || (major === 11 && minor < 5) ||
      (major === 11 && minor === 5 && patch < 1)) process.exit(1);
' "$npm_version" || fail "npm $npm_version is too old; trusted publishing requires npm >= 11.5.1"

preflight_tmp="$(mktemp -d)"
trap 'rm -rf "$preflight_tmp"' EXIT

github_oidc_response="$preflight_tmp/github-oidc.json"
github_status="$(
  curl --silent --show-error --get \
    --output "$github_oidc_response" \
    --write-out '%{http_code}' \
    --header "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
    --data-urlencode "audience=$NPM_OIDC_AUDIENCE" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL"
)" || fail "could not request a GitHub OIDC token"

[[ "$github_status" == "200" ]] ||
  fail "GitHub OIDC token request returned HTTP $github_status"

oidc_token="$({
  node -e '
    const fs = require("node:fs");
    const response = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (typeof response.value !== "string" || response.value.length === 0) process.exit(1);
    process.stdout.write(response.value);
  ' "$github_oidc_response"
} 2>/dev/null)" || fail "GitHub OIDC response did not contain an ID token"

encoded_package="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$package_name")"
npm_exchange_response="$preflight_tmp/npm-exchange.json"
npm_status="$(
  curl --silent --show-error --request POST \
    --output "$npm_exchange_response" \
    --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer $oidc_token" \
    "$NPM_REGISTRY/-/npm/v1/oidc/token/exchange/package/$encoded_package"
)" || fail "could not reach the npm OIDC token exchange endpoint"

unset oidc_token ACTIONS_ID_TOKEN_REQUEST_TOKEN

if [[ "$npm_status" != "201" ]]; then
  printf 'preflight-publish: npm OIDC exchange returned HTTP %s\n' "$npm_status" >&2
  printf '%s\n' "$CONFIGURE_MESSAGE" >&2
  exit 1
fi

node -e '
  const fs = require("node:fs");
  const response = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (response.token_type !== "oidc" ||
      typeof response.token !== "string" || response.token.length === 0) process.exit(1);
' "$npm_exchange_response" || fail "npm OIDC exchange returned an invalid response"

printf 'Trusted publisher preflight passed for %s.\n' "$package_name"
