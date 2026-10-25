---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-11-required-plan-optional

English | [中文](2026-11-11-required-plan-optional.zh.md)

## Summary

Adds an optional requiredPlan field to persisted LLM failure payloads on assistant stream chunks, llm/retry, and turn/end reasons, and an optional tokenSaver field to the model/selection payload and the request header call config.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing records remain valid. Readers that predate either field ignore it; a missing requiredPlan only means the failure carried no plan requirement, and a missing tokenSaver resolves the request without a saver mode, matching each absent-field meaning. Writers emit requiredPlan only on PLAN_REQUIRED-class failures and tokenSaver only when a selection carries one, so old events keep their meaning.

<a id="verification"></a>
## Verification

pnpm vitest run packages/llm/: 1680 tests passed, including plan-required coverage in llm-deepseek/tests/runtime.spec.ts and llm-deepseek-account/tests/account-quota.spec.ts. pnpm vitest run packages/api/session-controller packages/client/ui-model-selection: all tests passed, including tokenSaver selection, validation, serialization, and picker coverage.

<a id="dev-note"></a>
## Dev Note

None.
