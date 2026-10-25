---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-11-required-plan-optional

[English](2026-11-11-required-plan-optional.md) | 中文

## 概述

在 assistant 流式块、llm/retry 与 turn/end 原因的持久化 LLM 失败负载上新增可选 requiredPlan 字段，并在 model/selection 负载与请求头调用配置上新增可选 tokenSaver 字段。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-11-required-plan-optional
baseline: false
changes:
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "5f285798a0fefde08b2160513f55013a998053538e3a9154f1e3d6cc8c9624e7"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "91683734c166517c9df7c28dc8a052d33e5a270e84e7a5cdc4f5b230bc98e651"
    decision: same-version
  - root: "event:llm/retry"
    previous: "2026-09-14-image-offload"
    after: "b284515dd925e1bebd29b9d46ee66e540f821b89f71da7c23e94b3dec1fef465"
    decision: same-version
  - root: "event:model/selection"
    previous: "2026-09-11-initial"
    after: "082a8ccb7416dc7b97628364693f99b726ce4ef52373c30d0fe107ba51df4347"
    decision: same-version
  - root: "event:request/header"
    previous: "2026-09-16-session-format-v4"
    after: "7129e5f4c2b5f3da17e0cf1ed62ead790455517e4bdd93483e93d58badc47b5e"
    decision: same-version
  - root: "event:turn/end"
    previous: "2026-09-16-session-format-v4"
    after: "4a1ded2a3ee6eeb0f0e27ff70b3712c5fb0f65e99cb247c92195e37b6172ea45"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍然有效。旧读取方忽略这两个字段；缺少 requiredPlan 仅表示该失败未携带套餐要求，缺少 tokenSaver 按无省流模式解析请求，均与字段缺失的语义一致。写入方仅在 PLAN_REQUIRED 类失败时写入 requiredPlan、仅在选中项携带值时写入 tokenSaver，旧事件含义不变。

<a id="verification"></a>
## 验证

pnpm vitest run packages/llm/：1680 个测试通过，包括 llm-deepseek/tests/runtime.spec.ts 与 llm-deepseek-account/tests/account-quota.spec.ts 的套餐要求覆盖。pnpm vitest run packages/api/session-controller packages/client/ui-model-selection：全部测试通过，涵盖 tokenSaver 选中、校验、序列化与选择器覆盖。

<a id="dev-note"></a>
## 开发备注

无。
