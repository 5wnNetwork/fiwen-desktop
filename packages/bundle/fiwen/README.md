---
description: "The Fiwen deployment layer: one service origin, account-only credentials, and Vietnamese default locale, for users composing or customizing a profile."
kind: "package-bundle"
---

# @deepseek-ai/dsh-fiwen

English | [中文](README.zh.md)

## Summary

`dsh-fiwen` is the Fiwen deployment patch layer, applied as the third bundle of the `web` profile after `dsh-base` and `dsh-web-app`. It points every service surface at the Fiwen origin, replaces API-key onboarding with the Fiwen account flow, and sets Vietnamese as the default client language. You rarely touch this bundle directly — the shipped Fiwen `web` profile already includes it.

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

The shipped Fiwen `web` profile already includes this layer after `dsh-base` and `dsh-web-app`. To apply it to a custom base-backed profile, run `fwnd plugin --profile <name> add @deepseek-ai/dsh-fiwen`; in-box bundles resolve from the dsh installation, and the reconcile step activates the patch.

### What you get

- **One service origin.** `FIWEN_ORIGIN` (default `https://desktop.5wn.net`) feeds the account platform origin, the inference origin, the account Messages base (`/anthropic`), the web Search/Fetch API base (`/v1/tools`), and both OTLP telemetry intakes (`/v1/logs`). A loopback `FIWEN_ORIGIN` (localhost / 127.0.0.1 / [::1]) also enables `deepseek-account`'s `allowLoopbackHttp` opt-in for local development.
- **Account-only credentials.** `llm-deepseek` (the DeepSeek API-key route) and `web-search-deepseek` (the Messages-backed web search) are disabled; `agent-default-model` selects provider `deepseek-account` with model `FIWEN_DEFAULT_MODEL` (default `deepseek-flash`). Onboarding therefore leads to account sign-in rather than API-key entry.
- **Vietnamese UI.** `locale.defaultLocale: vi` plus the `dsh-client-locale-vi` language-pack row.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle declares no code of its own; `cordis.patch.yml` restates the target rows' configuration so the Loader composes the deployment. `FIWEN_ORIGIN` and `FIWEN_DEFAULT_MODEL` are read through environment placeholders in the patch document.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-base](../base/README.md) — the shared core this layer patches
- [dsh-client-locale-vi](../../client/locale-vi/README.md) — the Vietnamese dictionaries this layer activates

-----

<a id="model-experience"></a>
## Model Experience

None, as the bundle composes other packages' configuration and registers no prompt, tool, or session event of its own.

#### KV Cache effect

None; composition choices here do not alter prompt contents or history accounting.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The web-search settings switch can still select the Messages-backed provider pair; those providers are unmounted in this deployment, so that selection disables web search until the API pair is restored.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
