# Publishing `solounit`

## Current state and target

The currently deployed release workflow publishes with the long-lived `NPM_TOKEN` secret. It already requests `id-token: write` and passes `--provenance`, but those two settings do not activate OIDC while `NODE_AUTH_TOKEN` supplies the publish credential.

The prepared workflow switches publication to npm trusted publishing. It keeps `id-token: write` and `--provenance`, removes the `NODE_AUTH_TOKEN` wiring, and runs `scripts/preflight-publish.sh` immediately before `npm publish`. The preflight asks GitHub for the current workflow's OIDC identity and exchanges it at npm's package-scoped OIDC endpoint. A successful exchange proves that npm recognizes this exact repository and workflow for `solounit`; the returned short-lived token is discarded, and the preflight never uploads a package.

## Switch order

1. On npmjs.com, open `solounit` **Settings → Trusted Publisher** and configure GitHub Actions with organization/user `jonasun147852`, repository `solounit`, workflow filename `publish.yml`, no environment, and the `npm publish` allowed action.
2. Commit and push the prepared workflow, guard, and this documentation. Confirm that `.github/workflows/publish.yml` no longer references `NPM_TOKEN`; leave the existing secret itself untouched for now.
3. Only then create and push the release tag. The tag starts one guarded transaction: tests → trusted-publisher preflight → `npm publish --provenance --access public`. After a successful OIDC release, retire the now-unused long-lived token as a separate cleanup.

## Why the order cannot change

- If step 2 happens before step 1, the workflow has no usable npm credential. A release tag in that window cannot publish.
- If step 3 happens before step 2, the release still uses the long-lived token and therefore proves nothing about trusted publishing.
- The tag must be last because it is the irreversible publish trigger. The preflight can stop before upload when npm does not recognize the binding, but it cannot make an already-triggered release safe retroactively.

The important diagnostic lesson is that npm deliberately hides package authorization failures as “not found.” A missing or mismatched trusted publisher can therefore appear as `404 PUT ... Not found` even when the package exists. The error code points at the package/existence axis, while the real fault is on the authorization/identity axis. Check the trusted-publisher binding first; do not debug package naming from that 404 alone.

## References

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm OIDC token exchange API](https://api-docs.npmjs.com/)
