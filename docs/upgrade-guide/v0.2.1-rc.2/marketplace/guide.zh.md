---
kind: upgrade-guide
description: "Fiwen 在插件页面新增 Marketplace 标签页，可从 Fiwen 后端目录免费安装 skill 与 MCP 条目。"
---

# Marketplace 标签页

[English](guide.md) | 中文

## 变更

通过 `@deepseek-ai/dsh-fiwen` 组合的配置文件现在挂载 marketplace：

- `market` 行加载 `@deepseek-ai/dsh-market`，这是一个 `TypertRemoteService`，暴露 `market/catalog`、`market/detail`、`market/installItem`、`market/uninstallItem` 与 `market/installed` 远程方法，并在每次安装或卸载成功后发出 `market/changed` 事件。
- `ui-market` 行加载 `@deepseek-ai/dsh-client-ui-market`，通过插件页面已有的 `plugins.tab` 槽位贡献一个 Marketplace 标签页。该标签页提供分类筛选、文本搜索、类型筛选、按热度/独立安装数/最新/名称排序、详情视图以及安装与卸载操作。
- 服务默认从 `https://desktop.5wn.net` 读取 Fiwen 后端目录（可通过该行的 `origin` 配置覆盖），安装全部免费：skill 解压到 `<home>/skills/<id>/`，MCP 条目向活动 profile 补丁追加 `market-<id>` 行，`<home>/market/installs.json` 记录所有权以供卸载与已安装列表使用。
- 安装需要已登录的 Fiwen 账户；后端记录每次安装以统计总下载量与独立账户数。拒绝会以 `market/auth-required`、`market/conflict`、`market/no-profile` 或 `market/profile-unavailable` 远程错误的形式出现。

## 迁移

1. 不希望提供该标签页的组合可以在 `ui-market` 行上覆盖 `disabled: true`；宿主侧 `market` 行可以无害地保持挂载，或以同样方式禁用。
2. Fiwen 层的补丁可以覆盖该行的 `config.origin`，指向实现相同 `/v1/market` 协议的私有目录；未签名的开发构建保留默认的生产地址。
3. 无需数据迁移：安装账本与 skill 目录在首次安装时创建，手工删除某个 marketplace skill 目录或补丁行只会让它从已安装列表中消失。
