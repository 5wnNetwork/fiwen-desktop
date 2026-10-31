# Changelog

All notable changes to this fork are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the repository's release sequence.

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
