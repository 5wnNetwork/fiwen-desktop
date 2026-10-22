---
description: "Marketplace tab of the Fiwen Plugins page: search the curated catalog by category and popularity, and install free skills and MCP servers."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-market

English | [中文](README.zh.md)

## Summary

**Marketplace** is a tab of the **Plugins** page. It lists the skills and MCP tools the Fiwen catalog offers; users search, filter by kind and category, sort by popularity, open an item's page, and install or uninstall it. The Host [`market`](../../boot/market/README.md) service reads the catalog and performs installs; this package only presents them.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open **Plugins** and select **Marketplace**. The toolbar holds the search field, the **Type** menu (**All**, **Skills**, **MCP tools**), the **Sort** menu (**Downloads**, **Installs**, **Newest**, **Name**), and a refresh button. Category pills, with **All** first, follow when the catalog declares categories.

Each card shows the icon, localized title, a kind tag, a one-line summary, and downloads, installs, and version, with one action: **Install**, or **Installed** — which uninstalls on a second thought. Selecting a card opens the item's page with its long description and facts: type, version, author, homepage link, and category. The page's back link returns to the list with its search, filters, and sort intact.

The Host `market.catalog` searches, filters, orders, and pages; the tab sends the search text 250 ms after typing stops. The list loads 50 items and adds 50 with each **Show more**. Install and uninstall need a signed-in Fiwen account; a refusal — sign-in required, a same-named user skill or MCP server, or an environment without a writable profile — shows its reason under the toolbar until the next action.

Reading the catalog shows card skeletons. A failed read shows a short sentence with **Retry**; the Installed set refreshes on `market/changed` and connection reset.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The plugin registers the `market` entry, labelled **Marketplace**, into `plugins.tab`, the tab slot that [`ui-plugin-manager`](../ui-plugin-manager/README.md) declares. A React-free controller owns the query, the loaded pages, the installed set, and per-item work in a snapshot store; catalog text resolves through the locale service's fallback chain, so a deployment language pack can translate item titles. The unsent search text and the open item are component state. Icons load lazily with `referrerpolicy="no-referrer"` and fall back to the default artwork.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package renders Host data in the browser and adds nothing to model requests.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Remote icons** — URL icons are requested by the browser, which discloses the user's IP address to the image host; a failed icon shows the default artwork.
- **No update affordance** — an installed item shows as installed only; reinstalling fetches the catalog's current version.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
