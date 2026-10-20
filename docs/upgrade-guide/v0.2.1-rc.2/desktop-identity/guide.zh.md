---
kind: upgrade-guide
description: "默认 Fiwen home 由 `~/.dsh` 改为 `~/.fiwen`，Desktop 协议 scheme 由 `dsh://` 更名为 `fiwen://`。"
---

# Desktop 标识：`~/.fiwen` home 与 `fiwen://` scheme

[English](guide.md) | 中文

## 变更

三处对外可见的标识现在将 Fiwen 与上游 DeepSeek Harness 安装区分开，使两者可以并存运行：

- 默认 home 目录由 `~/.dsh` 改为 `~/.fiwen`。所有用户数据——profile、session、凭据、设置、已安装插件——都在该目录下解析。`$DSH_HOME` 仍然可以覆盖该位置；变化的只是缺省路径。
- Desktop 的 OS 协议 scheme 由 `dsh://` 改为 `fiwen://`。打包版本注册 `fiwen` 作为其处理的 scheme，前台深链接为 `fiwen://open`（原 `dsh://open`）。
- 打包应用标识由 `com.deepseek.harness` 改为 `com.fiwen.desktop`（Windows App User Model ID、macOS bundle identifier、更新元数据）。desktop 包清单同时声明 `productName: "Fiwen Desktop"`，未打包启动也报告相同的应用名。
- 开发启动现在在 Windows 上也会传入 `--user-data-dir`（macOS 此前已有），因此 Electron 单实例锁以该 checkout 自己的 `electron-user-data` 目录为准，而非共享的 `%APPDATA%` 默认值；两个 checkout 可同时运行。开发用 inspector 默认端口由 9229/9222/9230 移至 9329/9322/9330，原因相同。

不变项：`DSH_HOME` 及其他 `DSH_*` 环境变量名、`@deepseek-ai/dsh-*` 包名、`dsh` manifest 字段（`dsh.profile`、`engines.dsh`）、`.dsh-command-*` 命令回执文件，以及渲染进程加载所用的内部 `dsh-app://` 文档源。

## 迁移

1. 已有数据保留在 `~/.dsh` 中，新版本不会读取。要继续使用旧位置，在启动前导出 `DSH_HOME=~/.dsh`。要迁移状态，把需要的目录（例如 `sessions`、`.credentials.yaml`、`profiles`）从 `~/.dsh` 复制到 `~/.fiwen`。已存凭据不会自动迁移——请重新登录或重新填写 API 密钥。
2. 把所有用于打开桌面应用的 `dsh://` 链接或脚本更新为 `fiwen://`。如果上游 DeepSeek Harness 仍然安装，它继续持有 `dsh://`；`fiwen://` 链接将到达 Fiwen Desktop。
3. 重新安装打包版本以获得新的应用标识；旧标识创建的快捷方式与任务栏固定项可能需要重新创建。
