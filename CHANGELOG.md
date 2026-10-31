# Changelog

All notable changes to this fork are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the repository's release sequence.

## [0.2.1-rc.2] - 2026-10-31

### Added

- Marketplace installs are a two-step preview and install flow: `market.previewInstall(id)` returns a token that `market.installItem(token)` consumes, so users confirm catalog details before any skill or MCP entry is written (#5).

### Fixed

- Locale editor requests are hardened: the loopback server rejects unexpected `Host` values, requires an approved `Origin` and `application/json` for saves, and caps request bodies at 1 MiB (#7).

### Changed

- CI treats Windows coverage as a blocking gate by adding `windows-coverage` to the `all-checks-passed` aggregation.
- Real-API end-to-end workflows and their provider-key preflights are removed; keyless sandbox e2e and recorded-session snapshots remain the CI signal.
- Release rehearsals in `release.yml` and `release-vendor.yml` recognize the `5wnNetwork/fiwen-desktop` repository guard.
- The master `serial / macos` reference job is enabled again; it targets the generic `macos-latest` GitHub-hosted label.
- `FIWEN_ORIGIN` is documented in the desktop `.env` and packaging templates so test-channel packaging and smoke checks can target a non-production backend. Installed builds still resolve it from their process environment; a baked per-channel origin remains an open release item.
- README and README.zh.md describe this fork's repository, `fwnd` CLI, and run-from-source commands; they no longer present the upstream npm package as this fork's release.
