---
description: "客户端越南语语言包：在语言目录中注册 vi，并为每个客户端 locale namespace 提供一份词典。"
kind: "package-reference"
---
# @deepseek-ai/dsh-client-locale-vi

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-client-locale-vi` 是 DSH 客户端的越南语（Tiếng Việt）语言包。浏览器插件把 `vi` 加入可选语言目录——回退到英语——并为本工作区中客户端插件携带的每个 locale namespace 注册一份越南语词典。

## 目录

- [使用本包](#use-this-package)
- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在需要提供越南语界面文案的 profile 中把本包作为 Loader entry 挂载。

- `ctx.locale.addLanguage({ id: 'vi', label: 'Tiếng Việt', fallback: 'en' })` 使越南语在 Settings → Language 中可选。
- `ctx.locale.register(ns, 'vi', dict)` 为 `src/locales/index.ts`（`VI_DICTIONARIES`）中的每个 namespace 提供越南语文案。缺少越南语字符串的 key 通过 `vi → en` 回退链解析。
- 每份词典以 `satisfies Partial<Record<UpstreamKey, string>>` 声明类型，因此多余或拼错的 key 会在 typecheck 时报错，而新的上游 key 能编译通过，直到覆盖率测试报告它们未翻译。
- `tests/coverage.spec.ts` 对任何缺少越南语条目的英语 key 以及英语与越南语字符串之间的 `{placeholder}` 漂移都会失败。

-----

<a id="configuration"></a>
## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|

本包不接受配置字段；词典随源码发布。

-----

<a id="model-experience"></a>
## 模型体验

无，因为该语言包只注册界面词典，不提供提示词、工具或会话事件。

#### KV Cache 影响

无；locale 词典从不进入模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- `directory-browser` namespace 把上游词典内联在其 `apply` 中；覆盖率测试从该源文件读取其英语 key 集，而不是导入共享常量。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
