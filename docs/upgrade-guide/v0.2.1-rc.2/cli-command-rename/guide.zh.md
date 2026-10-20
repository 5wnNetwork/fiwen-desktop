---
kind: upgrade-guide
description: "公开 CLI 命令由 `dsh` 更名为 `fwnd`；内部标识符保持不变。"
---

# `dsh` 更名为 `fwnd`

[English](guide.md) | 中文

## 变更

公开启动器命令由 `dsh` 更名为 `fwnd`。更名覆盖 npm `bin` 入口（`@deepseek-ai/dsh` 现在安装 `fwnd`）、源码 checkout 的 `pnpm fwnd` 脚本、Commander 帮助与用法文本、`fwnd:` 诊断前缀、生成的 `docs/cli-help` 参考、Desktop 安装的命令（macOS 为 `/usr/local/bin/fwnd`，Windows PATH 为 `fwnd.cmd`）、TypeScript SDK 的 manifest 二进制查找（`bin.fwnd`），以及 Python 运行时 wheel 的控制台脚本。

内部标识符保持不变，无需处理：`@deepseek-ai/dsh-*` 包名、`DSH_HOME`/`DSH_SNAPSHOT` 等 `DSH_*` 环境变量、`dsh` manifest 字段（`dsh.profile`、`dsh.bundle`、`engines.dsh`）、`dsh_*` 协议字段、`dsh_extensions`、`dsh://` URL、`window.dsh`、profile 名称，以及内置运行时目录布局。

## 迁移

1. 在所有调用该命令的位置将 `dsh` 替换为 `fwnd`：shell 脚本、别名、CI 任务和编辑器/任务集成。源码 checkout 中 `pnpm dsh` 改为 `pnpm fwnd`（例如 `pnpm fwnd --profile headless "task"`）。
2. Desktop：如果旧版本注册过 `/usr/local/bin/dsh` 或 Windows 的 `dsh` PATH 项，请在升级前后移除该注册——打开应用的**管理命令**对话框，在旧版本上选择移除，然后在新版本上选择安装；也可以保留旧版本并手动删除链接。新版本注册 `fwnd`，并把已存在的 `dsh` 命令视为无关的外部安装。
3. npm 全局安装：重新安装该包（`npm uninstall -g @deepseek-ai/dsh && npm install -g @deepseek-ai/dsh`），让 npm 链接 `fwnd` bin 并移除过时的 `dsh` shim。
4. 从包 manifest 读取 `bin.dsh` 的工具（SDK 式启动器）现在读取 `bin.fwnd`。
