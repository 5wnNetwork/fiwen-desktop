---
kind: upgrade-guide
description: "Fiwen ships a Marketplace tab on the Plugins page that installs free skill and MCP catalog items from the Fiwen backend."
---

# Marketplace tab

English | [中文](guide.zh.md)

## Change

Profiles composed through `@deepseek-ai/dsh-fiwen` now mount a marketplace:

- The `market` row loads `@deepseek-ai/dsh-market`, a `TypertRemoteService` exposing `market/catalog`, `market/detail`, `market/installItem`, `market/uninstallItem`, and `market/installed` remotes, and emits `market/changed` after each successful install or uninstall.
- The `ui-market` row loads `@deepseek-ai/dsh-client-ui-market`, which contributes a Marketplace tab through the existing `plugins.tab` slot on the Plugins page. The tab offers category pills, text search, kind filtering, popularity/unique/newest/name sorting, a detail view, and install/uninstall actions.
- The service reads the Fiwen backend catalog at `https://desktop.5wn.net` (override through the row's `origin` config) and installs for free: skills extract under `<home>/skills/<id>/`, MCP items append a `market-<id>` row to the active profile patch, and `<home>/market/installs.json` tracks ownership for uninstall and for the installed listing.
- Installs require a signed-in Fiwen account; the backend records each install for total-download and unique-account counts. Refusals surface as `market/auth-required`, `market/conflict`, `market/no-profile`, or `market/profile-unavailable` remote errors.

## Migration

1. Compositions that must not ship the tab can overlay `disabled: true` on the `ui-market` row; the host `market` row can stay mounted harmlessly or be disabled the same way.
2. A Fiwen-layer patch may override the row's `config.origin` to point at a self-hosted catalog implementing the same `/v1/market` wire contract; unsigned development builds keep the production default.
3. No data migration is required: the install ledger and skill directories are created on first install, and removing a marketplace skill directory or patch row by hand simply drops it from the installed listing.
