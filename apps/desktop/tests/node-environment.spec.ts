import { delimiter } from 'node:path'
import { expect, it } from 'vitest'
import { desktopNodeEnvironment } from '../src/node-environment.ts'

it('keeps private Desktop launchers out of the Host environment inherited by PTC', () => {
  const environment = { PATH: '/user/bin', HOME: '/user' }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment)).toEqual({
    ...environment,
    DEEPSEEK_BASE_URL: 'https://desktop.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://desktop.5wn.net/v1/tools',
    ELECTRON_RUN_AS_NODE: '1',
  })
  expect(environment).toEqual({ PATH: '/user/bin', HOME: '/user' })
})

it('provides private launchers only to package installation processes', () => {
  expect(desktopNodeEnvironment('/desktop/electron', '/desktop/bin', { PATH: '/user/bin' })).toEqual({
    DEEPSEEK_BASE_URL: 'https://desktop.5wn.net/anthropic',
    DEEPSEEK_WEB_API_BASE_URL: 'https://desktop.5wn.net/v1/tools',
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
