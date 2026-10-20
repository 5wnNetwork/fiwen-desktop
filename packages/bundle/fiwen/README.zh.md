---
description: "Fiwen 部署层：统一服务源、仅账号凭据与越南语默认语言，供组合或定制 profile 的用户使用。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-fiwen

[English](README.md) | 中文

## 概述

`dsh-fiwen` 是 Fiwen 部署补丁层，作为 `web` profile 的第三个 bundle 应用，位于 `dsh-base` 与 `dsh-web-app` 之后。它把每个服务面指向 Fiwen 源，用 Fiwen 账号流程取代 API 密钥引导，并把越南语设为客户端默认语言。你很少需要直接操作此 bundle——随附的 Fiwen `web` profile 已包含它。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

随附的 Fiwen `web` profile 已在 `dsh-base` 与 `dsh-web-app` 之后包含此层。要应用到自定义 base-backed profile，运行 `fwnd plugin --profile <name> add @deepseek-ai/dsh-fiwen`；盒内 bundle 从 dsh 安装中解析，reconcile 步骤会激活该补丁。

### 你会得到什么

- **统一服务源。** `FIWEN_ORIGIN`（默认 `https://desktop.5wn.net`）为账号平台源、推理源、账号 Messages 基地址（`/anthropic`）、Web Search/Fetch API 基地址（`/v1/tools`）以及两处 OTLP 遥测入口（`/v1/logs`）提供地址。回环 `FIWEN_ORIGIN`（localhost / 127.0.0.1 / [::1]）还会为本地开发启用 `deepseek-account` 的 `allowLoopbackHttp` 选项。
- **仅账号凭据。** `llm-deepseek`（DeepSeek API 密钥路由）与 `web-search-deepseek`（基于 Messages 的 Web 搜索）被禁用；`agent-default-model` 选择 `deepseek-account` 提供商与模型 `FIWEN_DEFAULT_MODEL`（默认 `deepseek-flash`）。因此引导流程进入账号登录而非 API 密钥输入。
- **越南语界面。** `locale.defaultLocale: vi` 加上 `dsh-client-locale-vi` 语言包行。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部细节——点击展开</summary>

该 bundle 自身不声明代码；`cordis.patch.yml` 重述目标行的配置，使 Loader 组合出部署形态。`FIWEN_ORIGIN` 与 `FIWEN_DEFAULT_MODEL` 通过补丁文档中的环境占位符读取。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-base](../base/README.zh.md)——此层所补丁的共享核心
- [dsh-client-locale-vi](../../client/locale-vi/README.zh.md)——此层激活的越南语词典

-----

<a id="model-experience"></a>
## 模型体验

无，因为该 bundle 只组合其他包的配置，自身不注册提示词、工具或会话事件。

#### KV Cache 影响

无；此处的组合选择不改变提示词内容或历史计量。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- Web 搜索设置开关仍可选择基于 Messages 的提供方对；这些提供方在此部署中未挂载，因此该选择会禁用 Web 搜索，直到 API 对恢复。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
