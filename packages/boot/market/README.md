---
description: "Fiwen marketplace Host service: browse the curated catalog on the Fiwen origin and install free skills and MCP servers."
kind: "package-reference"
---

# @deepseek-ai/dsh-market

English | [中文](README.zh.md)

## Summary

`market` serves the Fiwen marketplace: a curated, admin-managed catalog of skills and MCP servers that the Fiwen origin publishes under `/v1/market`. Every item is free; the catalog lists localized titles and summaries, categories, and popularity counters — total downloads and distinct installing accounts — and the service returns them to the Web [Marketplace tab](../../client/ui-market/README.md). An install is authenticated by the `deepseekAccount` token when the configured origin is its inference origin.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Fiwen bundle mounts the service as the `market` row with the Fiwen origin; other profiles can mount it with their own origin or none at all — an origin without `/v1/market` simply answers every Remote with `market/fetch-failed` or `market/not-found`.

| Config | Default | Meaning |
|---|---|---|
| `origin` | `https://api.5wn.net` | Origin serving `/v1/market/*`. |
| `fetchTimeoutMs` | `15000` | Deadline for one catalog or install fetch. |
| `skillsDir` | `$DSH_HOME/skills` | User skill root that receives skill installs; `skill-filesystem` already scans it. |
| `marketDir` | `$DSH_HOME/market` | Ledger directory this service owns. |

The Remote methods are:

- `catalog(query)` returns one catalog page plus the category rail: `kind` (`skill` or `mcp`), `category`, `q` text, `sort` (`popular` by total downloads, `unique` by installing accounts, `newest`, `name`), and `offset`/`limit` paging.
- `detail(id)` returns one item's detail view, including its long description. Item payloads never appear in catalog or detail reads.
- `previewInstall(id)` fetches the install payload — which the backend counts as a download and, once per account, the unique download — and returns a review summary (file paths for skills; command, arguments, and environment variable *names* for stdio MCP; URL and header *names* for http MCP) plus a single-use token valid for ten minutes. Nothing is written locally, and env/header values never leave the Host. Installs require a signed-in account; `market/auth-required` refuses them otherwise.
- `installItem(token)` consumes a preview token and writes the cached payload locally — the skill directory or the `market-<id>` MCP row — without another fetch. Unknown, expired, or reused tokens fail with `market/preview-expired`; request a fresh preview before retrying.
- `uninstallItem(id)` removes the local artifact: the market-owned skill directory or the `market-<id>` MCP row. User-owned directories are never touched.
- `installed()` lists what this machine reports installed, reconciled against the artifacts that still exist.

`market/changed` announces every committed install or uninstall.

Failures use `market/fetch-failed`, `market/invalid-response`, `market/not-found`, `market/auth-required`, `market/conflict`, `market/profile-unavailable`, and `market/no-profile`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The service validates every wire body at the boundary: `wire.ts` rejects a malformed catalog, detail, or install body with the JSON path and rule, and a skill file whose path escapes its install directory (absolute, `..`, backslash, or drive letter) or exceeds 1 MiB never reaches disk. A skill install stages to a sibling directory, replaces the existing market-owned directory, and stamps a `.fiwen-market.json` marker recording its id and version; a directory without the marker is a user install and refuses with `market/conflict`. An MCP install becomes one `market-<id>` `mcp-client` row — `stdio` verbatim, `http` as `streamable-http` — inserted into the profile's `cordis.patch.yml`, which the profile watcher applies; re-installing replaces the row. A JSON ledger under `marketDir` reconciles the Installed set against the marker files and patch rows that still exist.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package reads a remote catalog and writes local artifacts; it adds nothing to model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Installs are whole-version replacements** — an item's installed files or MCP row are replaced as a unit; there is no per-file update or diff view.
- **Installed items are device-local** — `installed()` reconciles this machine only; the same account's installs on another device do not appear.
- **Review hides payload values** — the confirmation lists environment/header names and skill file paths, but values and file contents stay on the backend. A stdio `env` key that can change interpreter or loader behavior (`NODE_OPTIONS`, `LD_PRELOAD`, `PYTHONSTARTUP`, and similar) is rejected at the wire boundary so the hidden value cannot execute code.
- **Previews are bounded** — at most 32 unconfirmed previews are retained per Host; the oldest is evicted and then fails as `market/preview-expired`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`resolveToken` only returns a credential for the account's inference origin, so a `market` row whose `origin` differs from it installs anonymously and the backend refuses with 401.

</details>
