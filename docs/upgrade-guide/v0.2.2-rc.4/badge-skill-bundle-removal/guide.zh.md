---
kind: upgrade-guide
description: 可选徽章技能组合包不再随包提供或发布；徽章技能提供方保留。
---

# 移除 DSH 徽章技能组合包

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-experimental-badge-skill-bundle` 已从安装包中移除，且不再发布。该组合包是一个可选的 profile 层，只贡献一行 `skill-badge`；因此「插件」页面不再列出 **DSH 徽章技能**，也没有任何 profile 模板会选中它。

以下两类使用者会观察到这一变更：

- `package.json` 的 `dsh.profile.bundles` 中仍列出该组合包的 profile 将无法解析它，在该条目被移除前，该层加载失败。
- 曾把该包安装为依赖的 profile 会留下悬空引用。

`@deepseek-ai/dsh-skill-badge`——即注册 `dsh-badge` 技能的提供方——未作改动，仍在发布。仅组合包外壳被移除。

## 迁移

1. 从 `package.json` 的 `dsh.profile.bundles` 列表中移除该组合包：

   ```diff
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
   -  "@deepseek-ai/dsh-experimental-badge-skill-bundle",
      "@deepseek-ai/dsh-personalized-recommendations"
    ]
   ```

2. 如存在对应依赖条目，一并移除，然后重新安装并重启，使 profile 不再带着缺失的组合包加载。

3. 如仍需该徽章技能，改为依赖 `@deepseek-ai/dsh-skill-badge`，并在 profile 补丁中插入其插件行，而不是选中组合包：

   ```yaml
   - insert:
       - id: skill-badge
         name: '@deepseek-ai/dsh-skill-badge'
   ```

   默认组合不声明该行，因此添加它就是显式启用。

4. 确认 profile 中列出的每个组合包都能被解析——启动应用，检查「插件」页面能正常加载，且启动日志没有报告未解析的组合包。保留旧条目的 profile 会在该层加载失败。

会话日志、已保存的设置、安装载荷以及 `dsh-badge` 技能名均未改变。
