---
kind: upgrade-guide
description: "The public CLI command renamed from `dsh` to `fwnd`; internal identifiers are unchanged."
---

# Rename `dsh` to `fwnd`

English | [中文](guide.zh.md)

## Change

The public launcher command is now `fwnd` instead of `dsh`. The rename covers the npm `bin` entry (`@deepseek-ai/dsh` now installs `fwnd`), the source-checkout `pnpm fwnd` script, Commander help and usage text, `fwnd:` diagnostic prefixes, the generated `docs/cli-help` reference, the Desktop-installed command (`/usr/local/bin/fwnd` on macOS, `fwnd.cmd` on Windows PATH), the TypeScript SDK's manifest binary lookup (`bin.fwnd`), and the Python runtime wheel's console script.

Internal identifiers are unchanged and require no action: `@deepseek-ai/dsh-*` package names, `DSH_HOME`/`DSH_SNAPSHOT` and other `DSH_*` environment variables, `dsh` manifest fields (`dsh.profile`, `dsh.bundle`, `engines.dsh`), `dsh_*` wire fields, `dsh_extensions`, `dsh://` URLs, `window.dsh`, profile names, and the bundled runtime directory layout.

## Migration

1. Replace `dsh` with `fwnd` wherever the command is invoked: shell scripts, aliases, CI jobs, and editor/task integrations. In a source checkout, `pnpm dsh` becomes `pnpm fwnd` (for example `pnpm fwnd --profile headless "task"`).
2. Desktop: if a previous release registered `/usr/local/bin/dsh` or a Windows `dsh` PATH entry, remove that registration before or after upgrading — open the app's **Manage Command** dialog, choose Remove on the old release, then Install on the new one; the old release can also be left in place and unlinked manually. The new release registers `fwnd` and treats a pre-existing `dsh` command as an unrelated foreign installation.
3. npm global installs: reinstall the package (`npm uninstall -g @deepseek-ai/dsh && npm install -g @deepseek-ai/dsh`) so npm links the `fwnd` bin and drops the stale `dsh` shim.
4. Tooling that reads `bin.dsh` from the package manifest (SDK-style launchers) now reads `bin.fwnd`.
