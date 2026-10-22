---
description: "Fiwen 插件页的“市场”标签：按分类与人气搜索精选目录，并安装免费的技能与 MCP 服务器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-market

[English](README.md) | 中文

## 概述

**市场**是**插件**页的一个标签。它列出 Fiwen 目录提供的技能与 MCP 工具；用户可以搜索、按类型与分类过滤、按人气排序、打开条目页面并安装或卸载它。Host 端 [`market`](../../boot/market/README.zh.md) 服务读取目录并执行安装；本包只负责呈现。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

打开**插件**并选择**市场**。工具栏包含搜索框、**类型**菜单（**全部**、**技能**、**MCP 工具**）、**排序**菜单（**下载量**、**安装人数**、**最新**、**名称**）与刷新按钮。目录声明分类时，其下还会出现以**全部**开头的分类胶囊行。

每张卡片显示图标、本地化标题、类型标签、一行摘要，以及下载量、安装人数与版本，并带一个操作：**安装**，或**已安装**——再次点击即卸载。选中卡片会打开条目页面，显示长描述与事实信息：类型、版本、作者、主页链接与分类。页面的返回链接回到保留搜索、过滤与排序的列表。

Host 端 `market.catalog` 负责搜索、过滤、排序与分页；标签页在输入停止 250 毫秒后发送搜索文本。列表一次加载 50 条，每次**显示更多**再加 50 条。安装与卸载需要已登录的 Fiwen 账户；被拒绝时——需要登录、同名用户技能或 MCP 服务器已存在、或环境没有可写 profile——会在工具栏下方显示原因，直到下一次操作。

读取目录时显示卡片骨架。读取失败会显示一句简短提示与**重试**；已安装集合在 `market/changed` 与连接重置时刷新。

-----

<a id="understand-the-implementation"></a>
## 理解实现

本插件向 `plugins.tab`——[`ui-plugin-manager`](../ui-plugin-manager/README.zh.md) 声明的标签插槽——注册 `market` 条目，标签名为**市场**。一个无 React 的控制器在快照存储中持有查询、已加载页面、已安装集合与逐条目的安装工作；目录文本经 locale 服务的回退链解析，因此部署方语言包可以翻译条目标题。未发送的搜索文本与打开的条目是组件状态。图标懒加载并带 `referrerpolicy="no-referrer"`，失败时回退为默认图案。

-----

<a id="model-experience"></a>
## 模型体验

无：本包在浏览器中呈现 Host 数据，不向模型请求添加任何内容。

#### KV Cache 影响

无。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **远端图标** —— URL 图标由浏览器请求，会向图片主机暴露用户 IP 地址；图标加载失败时显示默认图案。
- **没有更新操作** —— 已安装条目只显示“已安装”；重新安装会获取目录中的当前版本。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
