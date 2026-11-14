---
kind: upgrade-guide
description: The DeepSeek chat import plugin is no longer shipped, published, or offered in the plugin manager.
---

# DeepSeek chat import removed

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-deepseek-chat-import` is removed from the installation and is no longer published. The plugin read a DeepSeek website chat export and wrote each conversation into the chosen Workspace as an ordinary Session, through an owner-only upload route.

Three readers observe this change:

- A profile whose `package.json` `dsh.profile.bundles` names the bundle no longer resolves it, so the profile fails to load that layer until the entry is removed.
- A `cordis.yml` that declares the `deepseek-chat-import` row fails to load, because the package it names is gone.
- The plugin manager's **More** list and the bundled-plugin list no longer offer it, so it cannot be added from the UI.

The removed surface is the `ctx.deepseekChatImport` service, the `POST /api/deepseek-chat-import/archive` route, and the sidebar session action that opened the import dialog.

Nothing replaces it: importing an external chat export is no longer a shipped capability.

## Migration

1. Remove the bundle from the profile's `dsh.profile.bundles` list in `package.json`:

   ```diff
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
   -  "@deepseek-ai/dsh-deepseek-chat-import",
      "@deepseek-ai/dsh-personalized-recommendations"
    ]
   ```

2. Remove its dependency entry if present, and remove any `deepseek-chat-import` row from your `cordis.yml` or overlay.

3. Reinstall and restart so the profile loads without the missing bundle. Confirm the Plugins page loads and the startup log reports no unresolved bundle.

Sessions that were imported earlier are ordinary stored Sessions, and their transcripts, titles, and Workspace assignment are unchanged. Nothing in the session format, stored settings, or install payloads moves with this removal. Continue such a Session directly in its Workspace; it needs no plugin. Pasting an export for the model to read remains available through the conversation itself.
