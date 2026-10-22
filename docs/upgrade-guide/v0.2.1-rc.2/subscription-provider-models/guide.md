---
kind: upgrade-guide
description: "The pi-ai subscription routes serve only explicitly configured models, and the Antigravity catalog consolidates tier-suffixed model ids into one reasoning model per family."
---

# Subscription routes: adopt-only catalogs and consolidated Antigravity ids

English | [中文](guide.zh.md)

## Change

The subscription routes `anthropic`, `openai-codex`, and `antigravity` — shown in the settings directory under their product labels Claude, ChatGPT, and Gemini — no longer serve their installed catalogs by default. A profile whose `models` list is absent now serves no models: the installed catalog is only the candidate list the settings model picker adopts from. `modelOverrides` is refused on these routes, because there is no inherited catalog to correct. Every other catalog route keeps its previous behavior, and an OAuth route's endpoint is provider-fixed, so the settings editor no longer offers `baseURL` for it.

The Antigravity catalog consolidates each tiered family into one reasoning-capable model; the request's thinking level selects the upstream wire name. The tier-suffixed picker ids are gone:

| Old ids | New id |
|---|---|
| `gemini-3.8-flash-{high,medium,low}` | `gemini-3.8-flash` |
| `gemini-3.7-flash-{high,medium,low}` | `gemini-3.7-flash` |
| `gemini-3.6-flash-{high,medium,low}` | `gemini-3.6-flash` |
| `gemini-pro-agent`, `gemini-3.1-pro-low` | `gemini-3.1-pro` |
| `claude-sonnet-5-5-{high,medium,low}` | `claude-sonnet-5-5` |
| `claude-opus-5-5-{high,medium,low}` | `claude-opus-5-5` |

A stored `models` entry naming an old id still saves — it resolves as a model the catalog does not describe — but its wire name loses the `(tier)` suffix the upstream expects, so the request fails at send time rather than at save.

The consolidated entries now spell only the thinking tiers each model actually offers: `gemini-3.8-flash` keeps low/medium/high; `gemini-4-argon-high`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, and `gpt-oss-120b-medium` each spell one level; `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.1-pro`, `claude-sonnet-5-5`, and `claude-opus-5-5` serve no reasoning levels. Declaring a `reasoningEfforts` level an entry cannot spell is refused at load, so effort declarations written against the old three-tier shapes may now fail validation.

Route keys are unchanged: `GenerateOptions.provider`, credential records, and `providers.<key>` settings paths are unaffected, and a configured `displayName` still wins over the product label.

## Migration

1. For each subscription route, set `providers.<key>.models` to the ids it should serve — or adopt them through the Models settings page's model picker, which writes the same list.
2. On `antigravity`, replace every tier-suffixed id in `models` with its family's new id from the table above; the reasoning effort the suffix encoded is now the request's thinking level. Keep a subset of tiers by declaring `reasoningEfforts` on the entry — and if an entry's level set shrank, narrow the declaration to the tiers it spells or drop the field.
3. Confirm the route serves: open the provider's editor on the Models settings page and check the model list, or send a chat request to a renamed model.
