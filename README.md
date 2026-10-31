# Fiwen

English | [中文](README.zh.md)

Fiwen (`fwnd`) is a community fork of [DeepSeek AI](https://deepseek.com)'s open-source agent harness, maintained at [5wnNetwork/fiwen-desktop](https://github.com/5wnNetwork/fiwen-desktop).

It keeps the upstream **everything-is-a-plugin** architecture powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation for this fork lives in this repository: start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

## Developer preview

Fiwen is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from source

To run this fork from a checkout:

```sh
git clone https://github.com/5wnNetwork/fiwen-desktop.git
cd fiwen-desktop
pnpm install
pnpm run build
pnpm fwnd web
```

`pnpm run build` prepares the repository artifacts. `pnpm fwnd web` uses those built artifacts without rebuilding.

The upstream npm package `@deepseek-ai/dsh` belongs to DeepSeek AI and is **not** this fork's release. Running `npx @deepseek-ai/dsh web` installs upstream software, not the code in this repository. Desktop installers are built from [apps/desktop](apps/desktop/README.md).

## Community and support

- Report bugs and feature requests for this fork through this repository's [issues](https://github.com/5wnNetwork/fiwen-desktop/issues).
- The upstream project's Discord community and `dsh-plugin` GitHub topic belong to DeepSeek AI and are not maintained by this fork.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Upstream project

Fiwen was created by DeepSeek AI at [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). Cite the upstream project when referring to its design:

```bibtex
@misc{deepseek-harness2026,
  title={Fiwen: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
