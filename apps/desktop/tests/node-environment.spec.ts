import { delimiter, join } from 'node:path'
import { expect, it } from 'vitest'
import { desktopNodeEnvironment } from '../src/node-environment.ts'
import { primaryRuntimeToolPath } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'

it('keeps private Desktop launchers out of the Host environment inherited by PTC', () => {
  const environment = { PATH: '/user/bin', HOME: '/user' }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment)).toEqual({
    ...environment,
    DEEPSEEK_BASE_URL: 'https://api.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://api.5wn.net/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
  })
  expect(environment).toEqual({ PATH: '/user/bin', HOME: '/user' })
})

it('provides private launchers only to package installation processes', () => {
  expect(desktopNodeEnvironment('/desktop/electron', '/desktop/bin', { PATH: '/user/bin' })).toEqual({
    DEEPSEEK_BASE_URL: 'https://api.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://api.5wn.net/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_NODE_EXECUTABLE: '/desktop/electron',
    PATH: `/desktop/bin${delimiter}/user/bin`,
  })
})

it('derives adapter endpoints from FIWEN_ORIGIN and lets explicit variables win', () => {
  const environment = {
    FIWEN_ORIGIN: 'http://localhost:8787',
    DEEPSEEK_BASE_URL: 'http://localhost:9999/anthropic',
  }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment)).toEqual({
    ...environment,
    DEEPSEEK_BASE_URL: 'http://localhost:9999/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'http://localhost:8787/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
  })
})

it('prepends bundled interpreter directories ahead of the inherited PATH without a launcher', () => {
  const environment = { PATH: '/user/bin', HOME: '/user' }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment, ['/runtime/uv/bin', '/runtime/node/bin'])).toEqual({
    ...environment,
    DEEPSEEK_BASE_URL: 'https://api.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://api.5wn.net/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
    PATH: `/runtime/uv/bin${delimiter}/runtime/node/bin${delimiter}/user/bin`,
  })
  expect(environment).toEqual({ PATH: '/user/bin', HOME: '/user' })
})

it('adds bundled interpreters to an inherited environment without PATH', () => {
  expect(desktopNodeEnvironment('/desktop/electron', undefined, {}, ['/runtime/uv/bin'])).toEqual({
    DEEPSEEK_BASE_URL: 'https://api.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://api.5wn.net/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
    PATH: '/runtime/uv/bin',
  })
})

it('keeps every bundled interpreter at higher precedence than the package-manager launcher', () => {
  expect(desktopNodeEnvironment('/desktop/electron', '/runtime/bin', { PATH: '/user/bin' }, ['/runtime/uv/bin']).PATH)
    .toBe(`/runtime/uv/bin${delimiter}/runtime/bin${delimiter}/user/bin`)
})

it('lists only bundled interpreter directories that exist', () => {
  const root = join('/resources', 'primary-runtime')
  const all = primaryRuntimeToolPath(root, () => true)
  expect(all).toEqual([
    join(root, 'dependencies', 'uv', 'bin'),
    join(root, 'dependencies', 'node', 'bin'),
    join(root, 'dependencies', 'python'),
    join(root, 'dependencies', 'python', 'bin'),
  ])
  expect(primaryRuntimeToolPath(root, path => path.endsWith(join('dependencies', 'uv', 'bin'))))
    .toEqual([join(root, 'dependencies', 'uv', 'bin')])
  expect(primaryRuntimeToolPath(root, () => false)).toEqual([])
})
