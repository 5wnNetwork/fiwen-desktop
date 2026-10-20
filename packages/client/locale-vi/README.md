---
description: "Vietnamese language pack for the client: registers vi in the language catalog and one dictionary per client locale namespace."
kind: "package-reference"
---
# @deepseek-ai/dsh-client-locale-vi

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-client-locale-vi` is the Vietnamese (Tiếng Việt) language pack for the DSH client. The browser plugin adds `vi` to the selectable-language catalog — falling back to English — and registers one Vietnamese dictionary for every locale namespace shipped by the client plugins in this workspace.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package as a Loader entry in a profile that should offer Vietnamese interface copy.

- `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` makes Vietnamese selectable in Settings → Language.
- `ctx.locale.register(ns, 'vi', dict)` supplies Vietnamese text for each of the namespaces in `src/locales/index.ts` (`VI_DICTIONARIES`). Keys missing a Vietnamese string resolve through the `vi → en` fallback chain.
- Each dictionary is typed `satisfies Partial<Record<UpstreamKey, string>>`, so extra or mistyped keys fail typecheck while new upstream keys compile until the coverage test reports them untranslated.
- `tests/coverage.spec.ts` fails on any English key without a Vietnamese entry and on any `{placeholder}` drift between the English and Vietnamese strings.

-----

<a id="configuration"></a>
## Configuration

| Field | Default | Meaning |
|---|---|---|

This package takes no configuration fields; dictionaries ship in source.

-----

<a id="model-experience"></a>
## Model Experience

None, as the pack registers only interface dictionaries and contributes no prompt, tool, or session event.

#### KV Cache effect

None; locale dictionaries never reach a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The `directory-browser` namespace keeps its upstream dictionaries inline in its `apply`; the coverage test reads its English key set out of that source file rather than importing a shared constant.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
