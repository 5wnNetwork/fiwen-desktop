---
kind: upgrade-guide
description: "pi-ai 订阅路由现在只提供显式配置的模型，Antigravity 目录将带层级后缀的模型 id 合并为每个系列一个推理模型。"
---

# 订阅路由：仅采纳的目录与合并后的 Antigravity 模型 id

[English](guide.md) | 中文

## 变更

订阅路由 `anthropic`、`openai-codex`、`antigravity` —— 在设置目录中以产品名 Claude、ChatGPT、Gemini 显示 —— 不再默认提供其内置目录。缺少 `models` 列表的配置文件现在不提供任何模型：内置目录只是设置页模型选择器从中采纳的候选列表。这些路由拒绝 `modelOverrides`，因为不存在可供修正的继承目录。其他目录路由保持原有行为；OAuth 路由的端点由提供方固定，因此设置编辑器不再为其提供 `baseURL`。

Antigravity 目录还将每个分层系列合并为一个具备推理能力的模型，由请求的思考级别选择上游线路名。带层级后缀的选择器 id 已移除：

| 旧 id | 新 id |
|---|---|
| `gemini-3.8-flash-{high,medium,low}` | `gemini-3.8-flash` |
| `gemini-3.7-flash-{high,medium,low}` | `gemini-3.7-flash` |
| `gemini-3.6-flash-{high,medium,low}` | `gemini-3.6-flash` |
| `gemini-pro-agent`、`gemini-3.1-pro-low` | `gemini-3.1-pro` |
| `claude-sonnet-5-5-{high,medium,low}` | `claude-sonnet-5-5` |
| `claude-opus-5-5-{high,medium,low}` | `claude-opus-5-5` |

仍以旧 id 命名的已存 `models` 条目可以保存 —— 它会解析为目录未描述的模型 —— 但其线路名会丢失上游所需的 `(tier)` 后缀，因此请求在发送时失败，而不是在保存时失败。

合并后的条目现在只拼出该模型实际提供的思考层级：`gemini-3.8-flash` 保留 low/medium/high；`gemini-4-argon-high`、`claude-sonnet-4-6`、`claude-opus-4-6-thinking` 与 `gpt-oss-120b-medium` 各只有一个层级；`gemini-3.7-flash`、`gemini-3.6-flash`、`gemini-3.1-pro`、`claude-sonnet-5-5` 与 `claude-opus-5-5` 不提供任何推理层级。声明条目无法拼写的 `reasoningEfforts` 层级会在加载时被拒绝，因此按旧三层结构编写的强度声明现在可能无法通过校验。

路由键不变：`GenerateOptions.provider`、凭据记录和 `providers.<key>` 设置路径均不受影响，已配置的 `displayName` 仍优先于产品名。

## 迁移

1. 为每个订阅路由设置 `providers.<key>.models`，列出应提供的模型 id —— 或通过模型设置页的模型选择器采纳，二者写入同一份列表。
2. 在 `antigravity` 上，按上表将 `models` 中每个带层级后缀的 id 替换为其系列的新 id；后缀原本编码的推理强度现在由请求的思考级别表达。如需只保留部分层级，在条目上声明 `reasoningEfforts` —— 若某条目的层级集合缩减，则将声明收窄到其拼写的层级或删除该字段。
3. 确认路由可服务：在模型设置页打开该提供方的编辑器检查模型列表，或向重命名后的模型发送一次对话请求。
