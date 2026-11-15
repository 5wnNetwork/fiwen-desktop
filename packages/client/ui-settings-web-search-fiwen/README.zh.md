---
description: "Fiwen 网络搜索设置卡片：用本部署自有的搜索与抓取服务替换官方提供方页面，无需密钥、地址或提供方选择。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-web-search-fiwen

[English](README.md) | 中文

## 概述

本包以 `web-search` id 占用插件页的 `plugins.item` 槽位，使 Fiwen 部署展示自有搜索服务，而不是官方 DeepSeek 提供方页面。卡片说明搜索与网页抓取在已登录账号的 Fiwen 服务上运行，不需要密钥、接口地址或提供方选择。Fiwen bundle 关闭 `ui-settings-web-search` 并插入本行，因为该部署的搜索与抓取提供方由 bundle 固定，并账号令牌鉴权。本包不拥有任何设置文档，也不自行发起请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在搜索与抓取提供方由组合固定的部署中，将本插件挂入浏览器侧插件列表。

### 替换关系

`ui-settings-web-search` 注册同一个 `plugins.item` id，因此两者不能同时生效：插入本行的部署需要关闭官方卡片。`web` 服务保留自身配置——bundle patch 中的 `searchProvider` 与 `fetchProvider`——本卡片不读取其中任何一项。

### 提供方设置

官方卡片写入提供方选择、结果数量与计费方式。本部署在 bundle 中固定这些值，因此卡片不提供控件，也不保存。需要可编辑的部署应保留官方卡片。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器侧通过 `ctx.slots.inject` 注册到 `plugins.item`，因此无论插件页在本次行激活之前还是之后声明该槽位，卡片都能挂载。`label` 与组件读取 `ui-settings-web-search-fiwen` 命名空间，其中包含 en、zh、ja、es、fr、de、ru、pt 与 vi。组件在 `view: 'summary'` 请求时返回描述，供插件页用作卡片单行说明；在页面视图下返回描述与其备注。Node 侧为空 Loader 座位。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-settings-web-search](../ui-settings-web-search/README.zh.md) — 本卡片替换的官方卡片。
- [ui-plugin-manager](../ui-plugin-manager/README.zh.md) — 声明 `plugins.item` 并渲染两种视图。
- [web-deepseek-api](../../web/web-deepseek-api/README.zh.md) — 把搜索与抓取发送到部署 `/v1/tools` 的提供方。

-----

<a id="model-experience"></a>
## 模型体验

无。本包仅提供浏览器展示，不触及模型请求。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **卡片只读** — 搜索与抓取设置属于 bundle 的 `web` 行，不属于本页可写的设置文档。
- **同一 id 只有一张卡片** — 部署必须关闭 `ui-settings-web-search`，因为两者都注册 `web-search` id。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

无。

</details>
