# Fiwen

[English](README.md) | 中文

Fiwen（`fwnd`）是 [DeepSeek AI](https://deepseek.com) 开源 agent harness 的社区分支，由 [5wnNetwork/fiwen-desktop](https://github.com/5wnNetwork/fiwen-desktop) 维护。

它保留了上游“一切皆插件”的架构，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

本分支的文档位于本仓库：请从[开发指南](docs/development.zh.md)和[架构文档](docs/architecture.zh.md)开始。

## 开发者预览

Fiwen 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

<a id="run-from-source"></a>

### 从源码运行

如需从本分支的仓库源码运行：

```sh
git clone https://github.com/5wnNetwork/fiwen-desktop.git
cd fiwen-desktop
pnpm install
pnpm run build
pnpm fwnd web
```

`pnpm run build` 会准备仓库产物；`pnpm fwnd web` 直接使用这些已构建产物，不会重新构建。

上游 npm 包 `@deepseek-ai/dsh` 属于 DeepSeek AI，**不是**本分支的发布物。执行 `npx @deepseek-ai/dsh web` 安装的是上游软件，而不是本仓库的代码。桌面安装包由 [apps/desktop](apps/desktop/README.zh.md) 构建。

## 社区与支持

- 本分支的 bug 与功能请求请通过本仓库的 [Issues](https://github.com/5wnNetwork/fiwen-desktop/issues) 提交。
- 上游项目的 Discord 社区与 `dsh-plugin` GitHub 话题由 DeepSeek AI 维护，不属于本分支。

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 上游项目

Fiwen 由 DeepSeek AI 在 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 创建。引用其设计时请标注上游项目：

```bibtex
@misc{deepseek-harness2026,
  title={Fiwen: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
