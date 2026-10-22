---
kind: upgrade-guide
description: "The Fiwen composition no longer mounts the message-feedback feature or the account menu's questionnaire entry, telemetry defaults to DISABLED, and the ui-settings-account contact config keys are gone."
---

# Feedback feature removal

English | [中文](guide.zh.md)

## Change

Profiles composed through `@deepseek-ai/dsh-fiwen` — the shipped Web and Desktop products — no longer mount the feedback feature: the Like/Dislike strip on assistant messages, the feedback dialog, the `/feedback` command, and the `messageFeedback` and `sessionFeedback` Host remotes are all absent. `feedback/message-put` and `feedback/message-delete` Session events stop being written; sessions that already contain them still replay, and their types remain in `SessionEventMap`. Compositions that skip the Fiwen layer — such as `dsh-base` plus `dsh-web-app` test scaffolds — still mount the plugins and keep every surface.

The account menu's questionnaire entry is also gone: it opened an external form, and `ui-settings-account` drops the `contactFormUrl` and `contactSource` config keys that located it. The page bootstrap global is now `__DSH_BONUS_CONFIG__` and carries only the bonus-acknowledgement timings, which are unchanged.

With no feedback surface, `session-telemetry-otel`'s `FEEDBACK_ONLY` gate can never authorize an upload, so the Fiwen layer's default `mode` is `DISABLED`; the `DSH_TELEMETRY_MODE` environment override still applies.

## Migration

1. Remove `contactFormUrl` and `contactSource` from any `ui-settings-account` config in profile patches or `--patch` overlays; leftover keys fail schema validation at load.
2. To keep the feedback feature in a custom composition, omit `@deepseek-ai/dsh-fiwen` or overlay `disabled: false` on the `command-feedback`, `message-feedback`, and `ui-message-feedback` rows.
3. No data migration is required: stored sessions containing feedback events read identically, and telemetry already stays local unless `DSH_TELEMETRY_MODE` is set.
