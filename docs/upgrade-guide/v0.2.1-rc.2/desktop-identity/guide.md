---
kind: upgrade-guide
description: "The default Fiwen home moved from `~/.dsh` to `~/.fiwen`, and the Desktop protocol scheme renamed from `dsh://` to `fiwen://`."
---

# Desktop identity: `~/.fiwen` home and `fiwen://` scheme

English | [中文](guide.zh.md)

## Change

Three externally perceptible identifiers now distinguish Fiwen from the upstream DeepSeek Harness installation so both can run side by side:

- The default home directory is `~/.fiwen` instead of `~/.dsh`. All user data — profiles, sessions, credentials, settings, installed plugins — resolves under it. `$DSH_HOME` still overrides the location; only the fallback path changed.
- The Desktop OS protocol scheme is `fiwen://` instead of `dsh://`. Packaged builds register `fiwen` as the handled scheme, and the foreground deep link is `fiwen://open` instead of `dsh://open`.
- The packaged application identity is `com.fiwen.desktop` instead of `com.deepseek.harness` (Windows App User Model ID, macOS bundle identifier, update metadata). The desktop package manifest also declares `productName: "Fiwen Desktop"`, so unpackaged launches report the same application name.
- Development launches now pass `--user-data-dir` on Windows (as macOS already did), so the Electron single-instance lock keys on the checkout's own `electron-user-data` directory instead of the shared `%APPDATA%` default; two checkouts can run at once. Development inspector defaults moved from ports 9229/9222/9230 to 9329/9322/9330 for the same reason.

Unchanged: the `DSH_HOME` and other `DSH_*` environment variable names, `@deepseek-ai/dsh-*` package names, `dsh` manifest fields (`dsh.profile`, `engines.dsh`), `.dsh-command-*` command-receipt files, and the internal `dsh-app://` document origin the renderer loads from.

## Migration

1. Existing data stays in `~/.dsh`; the new release does not read it. To keep the old location, export `DSH_HOME=~/.dsh` before launching. To carry state over, copy the directories you need (for example `sessions`, `.credentials.yaml`, `profiles`) from `~/.dsh` into `~/.fiwen`. Stored credentials are not migrated automatically — sign in again or re-enter API keys.
2. Update any `dsh://` links or scripts that open the desktop app to `fiwen://`. If upstream DeepSeek Harness remains installed, it keeps ownership of `dsh://`; `fiwen://` links reach Fiwen Desktop.
3. Reinstall the packaged build to pick up the new application identity; shortcuts and taskbar pins created by the old identity may need to be recreated.
