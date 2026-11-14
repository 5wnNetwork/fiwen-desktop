---
kind: upgrade-guide
description: The optional badge skill bundle is no longer shipped or published; the badge skill provider remains.
---

# DSH badge skill bundle removed

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-experimental-badge-skill-bundle` is removed from the installation and is no longer published. The bundle was an optional profile layer that contributed one `skill-badge` row, so the Plugins page no longer lists **DSH badge skill** and no profile template selects it.

Two readers observe this change:

- A profile whose `package.json` `dsh.profile.bundles` names the bundle no longer resolves it, so the profile fails to load that layer until the entry is removed.
- A profile that installed the package as a dependency leaves a dangling reference in `dependencies`.

`@deepseek-ai/dsh-skill-badge`, the provider that registers the `dsh-badge` skill, is unchanged and still published. Only the bundle wrapper is gone.

## Migration

1. Remove the bundle from the profile's `dsh.profile.bundles` list in `package.json`:

   ```diff
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
   -  "@deepseek-ai/dsh-experimental-badge-skill-bundle",
      "@deepseek-ai/dsh-personalized-recommendations"
    ]
   ```

2. Remove its dependency entry if present, then reinstall and restart so the profile loads without the missing bundle.

3. If you still want the badge skill, depend on `@deepseek-ai/dsh-skill-badge` and insert its row in your profile patch instead of selecting the bundle:

   ```yaml
   - insert:
       - id: skill-badge
         name: '@deepseek-ai/dsh-skill-badge'
   ```

   The default composition does not declare this row, so adding it is an explicit opt-in.

4. Confirm the profile lists every bundle it names — start the app and check the Plugins page loads and the startup log reports no unresolved bundle. A profile that keeps the old entry fails to load that layer.

Session logs, stored settings, install payloads, and the `dsh-badge` skill name are unchanged.
