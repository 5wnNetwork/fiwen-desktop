---
description: "面向侧栏与会话首屏的 Fiwen Desktop 品牌填充，由 Fiwen bundle 启用；供选择或替换品牌呈现的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-fiwen

[English](README.md) | 中文

## 概述

本包让 Fiwen 部署在侧栏与会话首屏显示 Fiwen 标志与本地化产品名。标志是一个内联 SVG 圆角方块、内部镂空字母 F，名称通过本包注册的 locale 命名空间渲染，因此 `Fiwen Desktop` 与 `Fiwen 桌面端` 始终由词典提供。Fiwen bundle 启用本插件并禁用 `ui-brand-official`；使用其他品牌的部署应提供替代品牌包。本包不保留运行时状态，也不影响模型请求。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在采用 Fiwen 品牌的部署中，将本插件挂载到浏览器插件名单；填充无条件注册，因此不需要构建 profile。

### 注册品牌

与 `ui-brand-official` 不同，本包没有 `DSH_CLIENT_BUILD_PROFILE` 门控：Fiwen 标志与名称始终注册 `sidebar.brand.mark`、`sidebar.brand.name` 与 `conversation.hero.brand.mark`。Fiwen bundle 通过一行禁用的 `ui-brand-official` 关闭官方品牌，因此与官方包一起组合时仍只有一个品牌生效。

### 替换品牌

自有身份的部署不组合本包，而是组合另一个占据相同 slot 的包。占据 slot 是唯一的组合路径；这里不存在任何品牌配置面。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

三个填充作为一组声明感知的注册安装：嵌套的 `ctx.slots.inject()` 调用等待侧栏与首屏声明，因此无论本行在声明者之前还是之后激活，这组注册都能工作；声明消失时全部填充一并撤回，HMR 期间也不会留下残缺的品牌混合。标志组件渲染带按实例唯一 mask id 的 Fiwen SVG；名称组件从本插件的 en/zh/vi 词典读取产品名。浏览器半部是 [`src/client/index.ts`](src/client/index.ts)；node 半部是一个空 Loader 座位。浏览器标题是构建环境的事（`DSH_CLIENT_TITLE`），不在 slot 系统之内。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当品牌面不够用时阅读以下页面。它们从本包占据的 slot 进入渲染这些 slot 的外壳。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.brand.mark` 与 `sidebar.brand.name` 并渲染其回退。
- [ui-conversation](../ui-conversation/README.zh.md)——在首屏声明 `conversation.hero.brand.mark`。
- [Web 客户端架构](../../../docs/subsystems/web-client.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本包只贡献浏览器呈现；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了品牌呈现的供给方式。它们是当前包约束，不是品牌设计对比或任务积压。

- **只有一组填充**——替代呈现属于占据相同 slot 的另一个 Cordis 包。
- **浏览器标题独立**——`DSH_CLIENT_TITLE` 在构建时选择标题文本，而非通过 UI slot。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
