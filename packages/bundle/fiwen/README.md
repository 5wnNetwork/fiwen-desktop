# @deepseek-ai/dsh-fiwen

The Fiwen deployment patch layer, applied as the third bundle of the `web`
profile after `dsh-base` and `dsh-web-app`.

## What it changes

- **One service origin.** `FIWEN_ORIGIN` (default `https://desktop.5wn.net`)
  feeds the account platform origin, the inference origin, the account
  Messages base (`/anthropic`), the web Search/Fetch API base (`/v1/tools`),
  and both OTLP telemetry intakes (`/v1/logs`). A loopback `FIWEN_ORIGIN`
  (localhost / 127.0.0.1 / [::1]) also enables `deepseek-account`'s
  `allowLoopbackHttp` opt-in for local development.
- **Account-only credentials.** `llm-deepseek` (the DeepSeek API-key route)
  and `web-search-deepseek` (the Messages-backed web search) are disabled;
  `agent-default-model` selects provider `deepseek-account` with model
  `FIWEN_DEFAULT_MODEL` (default `deepseek-flash`). Onboarding therefore leads
  to account sign-in rather than API-key entry.
- **Vietnamese UI.** `locale.defaultLocale: vi` plus the
  `dsh-client-locale-vi` language-pack row.

## Known Limitations and Deferred Work

- The web-search settings switch can still select the Messages-backed
  provider pair; those providers are unmounted in this deployment, so that
  selection disables web search until the API pair is restored.

## License

MIT
