# Agent Note: The account route never offers bundled models while its listing is unavailable

Status: implemented

English | [中文](2026-10-22-account-route-no-bundled-fallback.zh.md)

## Problem

Until the account's `GET /models` listing loaded, `deepseek-account` offered the transport's bundled catalog — `deepseek-flash` and `deepseek-v4-pro`, the upstream shipped entries — and a failed load pinned that state for `modelsMaxAgeMs` (ten minutes). In the Fiwen deployment a transient listing failure, such as a backend restart, surfaced branded official models the service never advertised, and they lingered for up to ten minutes with nothing explaining the substitution.

## Decision

- `resolveAccountCatalog` offers an empty catalog while no listing is held. Bundled entries stay in request resolution, so a model id a saved conversation or the `agent-default-model` setting already names still resolves and reaches the deployment's backend.
- A failed load retries once the failure is older than the new `modelsRetryAgeMs` (default thirty seconds) rather than the full `modelsMaxAgeMs`. An access past that age while no listing is held waits for the retry, matching the first-load contract, and returns the recovered listing in the same access.
- While signed in with no listing, the provider directory entry carries `model listing unavailable; retrying`; the Models page keeps the account row visible whenever its directory entry carries an error, so the outage reaches the user instead of hiding the provider.
- This narrows the no-listing branch of the [account remote model catalog decision](../architecture/2026-09-24-deepseek-account-remote-model-catalog.md); listing, version gating, and per-account scoping are unchanged.

## Alternatives considered

**Keep the bundled offer.** Upstream ships it so an offline start still shows usable ids, but for this deployment the offered ids carry another product's branding and only `deepseek-flash` exists in the model table, so the display was mostly wrong rather than helpful.

**Persist the last good listing.** It would restore real models across restarts at the cost of a persistence format and its migration; the short retry age plus an always-visible outage covers the common transient without new durable state.

**Background retry only.** Returns the empty state instantly but surfaces recovered models one access later; awaiting the retry while nothing is held matches the first-load contract and fills the picker in the same access.

## Consequences

- A listing outage shows the account provider's diagnostic and no models in place of official entries; the catalog self-heals on the first access past `modelsRetryAgeMs` after the listing recovers.
- Requests keep resolving bundled knowledge and unlisted ids pass through to the backend, so existing conversations and the default model still run during an outage and the service decides their validity.
- The Models page account row stays visible for any diagnostic-bearing directory entry, not only when its catalog has models.
