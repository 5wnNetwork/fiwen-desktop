---
kind: upgrade-guide
description: "Fiwen 组合不再挂载 session 日志上传功能及其设置开关；session 事件不会嵌入模型 API 请求。"
---

# 移除 Session 日志上传

[English](guide.md) | 中文

## 变更

通过 `@deepseek-ai/dsh-fiwen` 组合的配置文件——即发布的 Web 和 Desktop 产品——不再挂载 session 日志上传功能。`session-log-deepseek` 插件原本注册 `dsh_session_log` 请求扩展，可能将 session 事件嵌入模型 API 流量；`ui-settings-session-log` 插件提供写入其 `enabled` 标志的通用设置开关。两行均已禁用，上传路径及其设置界面不再存在。跳过 Fiwen 层的组合仍会挂载这两个插件并保留全部界面。

Session 日志在本地仍可读：`session-log-deepseek/delivery-accepted` 事件类型保留在 `KNOWN_SESSION_EVENT_TYPES` 中，已包含该事件的 session 仍可正常回放。独立的 OTLP 遥测路径在 Fiwen 下默认保持 `DISABLED`，除非 `DSH_TELEMETRY_MODE` 覆盖。

## 迁移

1. 从基于 Fiwen 层的 profile 补丁或 `--patch` 覆盖中移除所有 `session-log-deepseek` 或 `ui-settings-session-log` 配置行；禁用行上的配置不会被消费。
2. 如需在自定义组合中保留上传功能，请去掉 `@deepseek-ai/dsh-fiwen`，或对这两行覆盖 `disabled: false`。
3. 无需数据迁移：包含 `session-log-deepseek/delivery-accepted` 事件的已存 session 读取结果不变，且此路径不再写入新的 session 事件。
