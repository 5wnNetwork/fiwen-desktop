---
description: "Fiwen 市场 Host 服务：浏览 Fiwen 源站上的精选目录，并安装免费的技能与 MCP 服务器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-market

[English](README.md) | 中文

## 概述

`market` 提供 Fiwen 市场服务：由管理员维护、Fiwen 源站在 `/v1/market` 下发布的技能与 MCP 服务器目录。所有条目均免费；目录列出本地化标题与摘要、分类以及人气计数——总下载量与去重安装账户数——服务把它们返回给 Web 端[市场标签页](../../client/ui-market/README.zh.md)。当所配置的源站是 `deepseekAccount` 的推理源站时，安装由账户令牌鉴权。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Fiwen 包以 `market` 行挂载本服务并指向 Fiwen 源站；其他 profile 可以携带自己的源站挂载它，或完全不挂载——没有 `/v1/market` 的源站会让每个 Remote 以 `market/fetch-failed` 或 `market/not-found` 回应。

| 配置项 | 默认值 | 含义 |
|---|---|---|
| `origin` | `https://desktop.5wn.net` | 提供 `/v1/market/*` 的源站。 |
| `fetchTimeoutMs` | `15000` | 单次目录或安装请求的时限。 |
| `skillsDir` | `$DSH_HOME/skills` | 接收技能安装的用户技能根目录；`skill-filesystem` 已在扫描它。 |
| `marketDir` | `$DSH_HOME/market` | 本服务拥有的台账目录。 |

Remote 方法：

- `catalog(query)` 返回一页目录及分类栏：`kind`（`skill` 或 `mcp`）、`category`、`q` 文本、`sort`（按总下载量的 `popular`、按安装账户数的 `unique`、`newest`、`name`）以及 `offset`/`limit` 分页。
- `detail(id)` 返回单个条目的详情视图，含长描述。目录与详情读取都不携带条目负载。
- `installItem(id)` 向后端登记安装——计入下载量，且每个账户只计一次去重下载——再把返回的负载写入本机并返回登记结果。安装要求已登录账户，否则以 `market/auth-required` 拒绝。
- `uninstallItem(id)` 移除本地制品：市场拥有的技能目录或 `market-<id>` MCP 行。用户自有的目录从不会被触碰。
- `installed()` 列出本机报告已安装的条目，并与磁盘上仍存在的制品对账。

每次提交的安装或卸载都会以 `market/changed` 通告。

失败使用 `market/fetch-failed`、`market/invalid-response`、`market/not-found`、`market/auth-required`、`market/conflict`、`market/profile-unavailable` 与 `market/no-profile`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

服务在边界上校验每个 wire 报文：`wire.ts` 以 JSON 路径与规则拒绝畸形的目录、详情或安装响应；凡会逃逸安装目录（绝对路径、`..`、反斜杠或盘符）或超过 1 MiB 的技能文件路径都不会落盘。技能安装先写入同级暂存目录，再替换已有的市场目录，并盖上记录其 id 与版本的 `.fiwen-market.json` 标记；没有该标记的目录视为用户安装并以 `market/conflict` 拒绝。MCP 安装成为一行 `market-<id>` `mcp-client`——`stdio` 原样写入，`http` 写作 `streamable-http`——插入 profile 的 `cordis.patch.yml`，由 profile 监视器应用；重复安装会替换该行。`marketDir` 下的 JSON 台账把“已安装”集合与仍存在的标记文件和 patch 行对账。

-----

<a id="model-experience"></a>
## 模型体验

无：本包读取远端目录并写入本地制品，不向模型请求添加任何内容。

#### KV Cache 影响

无。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **安装是整版本替换** —— 条目的文件或 MCP 行按整体替换；没有逐文件更新或差异视图。
- **已安装条目是设备本地的** —— `installed()` 只与本机对账；同一账户在其他设备上的安装不会出现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

`resolveToken` 只为账户的推理源站返回凭据，因此 `origin` 与之不同的 `market` 行会以匿名方式安装，后端将以 401 拒绝。

</details>
