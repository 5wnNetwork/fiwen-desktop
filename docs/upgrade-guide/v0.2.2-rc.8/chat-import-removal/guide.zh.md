---
kind: upgrade-guide
description: 不再随安装发布 DeepSeek chat import 插件，也不再在插件管理器中提供。
---

# 移除 DeepSeek chat import

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-deepseek-chat-import` 已从安装中移除，也不再发布。该插件读取 DeepSeek 官网的会话导出，并通过仅 owner 可用的上传路由，把每段对话作为普通会话写入所选工作区。

三类读者会观察到这一变更：

- 若 profile 的 `package.json` 中 `dsh.profile.bundles` 仍列着该 bundle，则不再能解析，profile 在移除该项之前无法加载该层。
- 若 `cordis.yml` 声明了 `deepseek-chat-import` 行，则无法加载，因为它引用的包已不存在。
- 插件管理器的 **More** 列表与内置插件列表不再提供它，因此无法从界面添加。

被移除的接口是 `ctx.deepseekChatImport` 服务、`POST /api/deepseek-chat-import/archive` 路由，以及侧栏中打开导入对话框的会话操作。

没有替代方案：导入外部会话导出不再是一项随附能力。

## 迁移

1. 从 profile 的 `package.json` 中 `dsh.profile.bundles` 列表移除该 bundle：

   ```diff
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
   -  "@deepseek-ai/dsh-deepseek-chat-import",
      "@deepseek-ai/dsh-personalized-recommendations"
    ]
   ```

2. 若存在依赖项，一并移除；并从 `cordis.yml` 或覆盖层中删除 `deepseek-chat-import` 行。

3. 重新安装并重启，使 profile 在没有该 bundle 的情况下正常加载。确认插件页面能打开，且启动日志没有未解析的 bundle 报告。

此前导入的会话就是普通的已存会话，其记录、标题和工作区归属均不变。会话格式、已存设置和安装载荷都不随本次移除改变。可直接在会话所在工作区中继续该会话，无需任何插件；若要把导出内容交给模型阅读，仍可通过对话本身粘贴。
