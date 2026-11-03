# Changelog

All notable changes to this fork are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the repository's release sequence.

## [Unreleased]

### Security

- `undici` is 8.12.3 in `dsh-http-proxy` and `dsh-web-fetch-http` (was 8.11.2), clearing the dropped-TLS-options, cross-origin redirect cache-poisoning, decompression, and renegotiation advisories in the process-wide dispatcher and the public fetch provider.
- `@modelcontextprotocol/client` is 2.4.0, and the MCP SDK reached through `@anthropic-ai/claude-agent-sdk` and `@google/genai` resolves to 1.32.2 (was 2.2.0 / 1.31.0): experimental tasks were not tied to the session that created them, one oversized message could exhaust memory during validation, and server bearer authentication was bypassable.
- pnpm overrides pin the transitive `hono`, `@hono/node-server`, `body-parser`, `qs`, `ip-address`, `fast-uri`, `zod`, and `fflate` copies to their patched releases, so `pnpm audit --prod` reports no advisory in shipped code; the remaining entries belong to the dev-only vitest toolchain (vite, happy-dom, `@vitest/mocker`).

### Changed

- The backend is split across two origins: `FIWEN_ORIGIN` (default `https://api.5wn.net`) now addresses the account platform, inference, web tools, marketplace, and telemetry, while the new `FIWEN_DASH_ORIGIN` (default `https://dash.5wn.net`) serves the browser sign-in pages and the embedded Usage/Top-up views. `https://desktop.5wn.net` remains the public download and auto-update origin.
- Desktop release uploads speak the S3 API through `@aws-sdk/client-s3` instead of the Tencent COS SDK, so any S3-compatible service can hold the update bucket. `desktop-cos.ts`, `desktop-publish-cos.ts`, `installed-update-cos.ts`, the SDK-specific loopback harness, and the COS-only installed-update publication entry are gone; `desktop-s3.ts`, `s3-operation.ts`, `desktop-publish-s3.ts`, and `tests/s3-loopback.ts` replace them. Requests use path-style addressing and `maxAttempts: 1`, and flexible checksums are set to `WHEN_REQUIRED` so a streamed PUT is a plain body with `Content-MD5` rather than `aws-chunked` with a trailer.
- Release operators configure storage with `DOWNLOAD_TEST_S3_BUCKET`, `DOWNLOAD_TEST_S3_ENDPOINT`, `DOWNLOAD_TEST_S3_ACCESS_KEY_ID`, `DOWNLOAD_TEST_S3_SECRET_ACCESS_KEY`, and the same `PROD` names, replacing the `*_COS_*` variables. `DOWNLOAD_*_S3_REGION` is optional and defaults to `us-east-1`. Immutable binary writes use `If-None-Match: *` instead of `x-cos-forbid-overwrite`, so the bucket service must honor S3 conditional writes. The production upload origin and publish configuration no longer hardcode `download.deepseek.com`.
- Windows credential files hold DPAPI-encrypted `AccessKeyId` and `SecretAccessKey` fields, and the launcher accepts dotted bucket names.

### Fixed

- Every workspace `package.json` reports the root version (`0.2.1-rc.3`); 351 manifests were still on `0.2.1-rc.2`, which failed `pnpm run constraints` and the release version checks.
- `@deepseek-ai/dsh-client-ui-market` declares its `files` payload (`lib/index.js`, `lib/client.js`, `lib/types/**/*.d.ts`), so a published tarball would actually contain the browser bundle.
- The product-package policy records the three rows the Fiwen patch disables (`ui-brand-official`, `ui-message-feedback`, `ui-settings-session-log`), so `verify-product-use` accepts them instead of demanding a mount.

### Not changed

- No product behavior, wire format, or session format change; the marketplace preview flow and locale-editor hardening from 0.2.1-rc.3 stand.

## [0.2.1-rc.3] - 2026-10-31

### Added

- Marketplace installs are a two-step preview and install flow: `market.previewInstall(id)` returns a token that `market.installItem(token)` consumes, so users confirm catalog details before any skill or MCP entry is written (#5).

### Fixed

- Locale editor requests are hardened: the loopback server rejects unexpected `Host` values, requires an approved `Origin` and `application/json` for saves, and caps request bodies at 1 MiB (#7).

### Changed

- CI treats Windows coverage as a blocking gate by adding `windows-coverage` to the `all-checks-passed` aggregation.
- Real-API end-to-end workflows and their provider-key preflights are removed; keyless sandbox e2e and recorded-session snapshots remain the CI signal.
- Release rehearsals in `release.yml` and `release-vendor.yml` recognize the `5wnNetwork/fiwen-desktop` repository guard.
- The master `serial / macos` reference job is enabled again; it targets the generic `macos-latest` GitHub-hosted label.
- `FIWEN_ORIGIN` is baked into packaged manifests as `dshDesktopOrigin`, so a test-channel installer started without environment variables still talks to its own backend; an explicit `FIWEN_ORIGIN` in the process environment or login shell wins.
- README and README.zh.md describe this fork's repository, `fwnd` CLI, and run-from-source commands; they no longer present the upstream npm package as this fork's release.
