---
kind: upgrade-guide
description: "Fiwen 组合不再挂载消息反馈功能与账号菜单的问卷入口，遥测默认改为 DISABLED，ui-settings-account 的 contact 配置键已移除。"
---

# 移除反馈功能

[English](guide.md) | 中文

## 变更

经由 `@deepseek-ai/dsh-fiwen` 组合的配置文件 —— 即随产品发布的 Web 与桌面端 —— 不再挂载反馈功能：助手消息上的赞/踩按钮、反馈对话框、`/feedback` 命令，以及 `messageFeedback` 和 `sessionFeedback` 两个 Host Remote 全部缺席。`feedback/message-put` 与 `feedback/message-delete` Session 事件不再写入；已包含这些事件的会话仍可回放，其类型保留在 `SessionEventMap` 中。跳过 Fiwen 层的组合 —— 例如仅由 `dsh-base` 与 `dsh-web-app` 构成的测试脚手架 —— 仍会挂载这些插件并保留所有界面。

账号菜单中的问卷入口同样移除：它此前打开一个外部表单，定位该表单的 `ui-settings-account` 配置键 `contactFormUrl` 与 `contactSource` 一并删除。页面引导全局量改为 `__DSH_BONUS_CONFIG__`，仅承载奖励确认计时，行为不变。

由于不再存在反馈界面，`session-telemetry-otel` 的 `FEEDBACK_ONLY` 门槛永远无法授权上传，因此 Fiwen 层将默认 `mode` 改为 `DISABLED`；环境变量 `DSH_TELEMETRY_MODE` 的覆盖仍然生效。

## 迁移

1. 从配置文件补丁或 `--patch` 覆盖中删除 `ui-settings-account` 配置里的 `contactFormUrl` 与 `contactSource`；残留的键会在加载时被模式校验拒绝。
2. 若自定义组合需要保留反馈功能，不使用 `@deepseek-ai/dsh-fiwen`，或通过覆盖把 `command-feedback`、`message-feedback`、`ui-message-feedback` 三行重新设为 `disabled: false`。
3. 无需数据迁移：含有反馈事件的已存会话按原样读取；未设置 `DSH_TELEMETRY_MODE` 时遥测本就保持在本地。
