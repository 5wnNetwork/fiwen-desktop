---
description: "Fiwen Desktop brand occupants for the sidebar and conversation hero, enabled by the Fiwen bundle; for users and maintainers choosing or replacing brand presentation."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-fiwen

English | [中文](README.zh.md)

## Summary

This package gives a Fiwen deployment the Fiwen mark and the localized product name in the sidebar and the conversation hero. The mark is an inline SVG rounded square with a knocked-out letter F, and the name is rendered through this package's registered locale namespace, so `Fiwen Desktop` and `Fiwen 桌面端` stay locale-owned. The Fiwen bundle enables this plugin and disables `ui-brand-official`; deployments with another identity should provide a replacement brand package. It has no runtime state and does not affect model requests.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin in the browser roster of a deployment whose identity is Fiwen; the occupants register unconditionally, so no build profile is required.

### Registering the brand

Unlike `ui-brand-official`, this package has no `DSH_CLIENT_BUILD_PROFILE` gate: the Fiwen mark and name always register for `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark`. The Fiwen bundle turns the official brand off with a disabled `ui-brand-official` row, so composing this package beside the official one leaves a single active brand.

### Replacing the brand

A deployment with its own identity leaves this package out and composes another package that occupies the same slots. Occupying a slot is the only composition route; there is no brand configuration surface here.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The three occupants install as one declaration-aware registration set: nested `ctx.slots.inject()` calls wait on the sidebar and hero declarations, so the set works whether this row activates before or after the declarer, withdraws all occupants when a declaration collapses, and leaves no partial brand mix during HMR. The mark component renders the Fiwen SVG with per-instance mask ids; the name component reads the product name from this plugin's en/zh/vi dictionaries. The browser half is [`src/client/index.ts`](src/client/index.ts); the node half is an empty Loader seat. The browser title is a build-environment concern (`DSH_CLIENT_TITLE`), outside the slot system.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the brand surface is not enough. They move from the slots this package occupies to the shell that renders them.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.mark` and `sidebar.brand.name` and renders their fallbacks.
- [ui-conversation](../ui-conversation/README.md) — declares `conversation.hero.brand.mark` in the hero.
- [Web client architecture](../../../docs/subsystems/web-client.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define how brand presentation is supplied. They are current package constraints, not a brand-design comparison or a task backlog.

- **One occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
