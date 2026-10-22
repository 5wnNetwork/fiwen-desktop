---
kind: upgrade-guide
description: "The Fiwen composition no longer mounts the session-log upload feature or its settings toggle; session events are never embedded into model-API requests."
---

# Session-log upload removal

English | [中文](guide.zh.md)

## Change

Profiles composed through `@deepseek-ai/dsh-fiwen` — the shipped Web and Desktop products — no longer mount the session-log upload feature. The `session-log-deepseek` plugin registered a `dsh_session_log` request extension that could embed session events into model-API traffic, and the `ui-settings-session-log` plugin contributed the General-settings toggle that wrote its `enabled` flag. Both rows are disabled, so the upload path and its settings surface are absent. Compositions that skip the Fiwen layer still mount both plugins and keep every surface.

Session logs remain readable locally: the `session-log-deepseek/delivery-accepted` event type stays in `KNOWN_SESSION_EVENT_TYPES`, and sessions that already contain it still replay. The separate OTLP telemetry path keeps its Fiwen default of `DISABLED` unless `DSH_TELEMETRY_MODE` overrides it.

## Migration

1. Remove any `session-log-deepseek` or `ui-settings-session-log` config rows from profile patches or `--patch` overlays built on the Fiwen layer; config on a disabled row is not consumed.
2. To keep the upload feature in a custom composition, omit `@deepseek-ai/dsh-fiwen` or overlay `disabled: false` on both rows.
3. No data migration is required: stored sessions containing `session-log-deepseek/delivery-accepted` events read identically, and no new session events are written through this path.
