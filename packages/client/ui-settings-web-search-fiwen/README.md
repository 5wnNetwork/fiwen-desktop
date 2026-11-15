---
description: "Fiwen web search settings card: replaces the official provider page with the deployment's own search and fetch service, which needs no key, endpoint, or provider choice."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search-fiwen

English | [中文](README.zh.md)

## Summary

This package occupies the Plugins page's `plugins.item` slot under the `web-search` id, so a Fiwen deployment shows its own search service instead of the official DeepSeek provider page. The card states that search and page fetching run on the Fiwen service behind the signed-in account and that no key, endpoint, or provider choice applies. The Fiwen bundle disables `ui-settings-web-search` and inserts this row, because the deployment's search and fetch providers are fixed in the bundle and authenticated by the account token. It owns no settings document and sends no request of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster of a deployment whose search and fetch providers are fixed by its composition.

### What replaces what

`ui-settings-web-search` registers the same `plugins.item` id, so the two packages cannot both be active: a deployment that inserts this row disables the official one. The `web` service keeps its own configuration — `searchProvider` and `fetchProvider` in the bundle's patch — and this card reads none of it.

### Provider settings

The official card writes the provider selection, the result count, and the billing mode. This deployment fixes those in the bundle, so the card offers no control and no save. A deployment that wants them editable keeps the official card instead.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half registers into `plugins.item` through `ctx.slots.inject`, so the card mounts whether the Plugins page declares the slot before or after this row activates. `label` and the component read the `ui-settings-web-search-fiwen` namespace, which carries en, zh, ja, es, fr, de, ru, pt, and vi. The component returns the description for a `view: 'summary'` request, which the page uses for the card's one-liner, and the description plus its note for the page view. The node half is an empty Loader seat.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings-web-search](../ui-settings-web-search/README.md) — the official card this one replaces.
- [ui-plugin-manager](../ui-plugin-manager/README.md) — declares `plugins.item` and renders both views.
- [web-deepseek-api](../../web/web-deepseek-api/README.md) — the provider that sends search and fetch to the deployment's `/v1/tools`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The card is read-only** — search and fetch settings belong to the bundle's `web` row, not to a settings document this page can write.
- **One card per id** — the deployment must disable `ui-settings-web-search`, because both register the `web-search` id.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
