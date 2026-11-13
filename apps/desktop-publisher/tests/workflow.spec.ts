import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { load } from 'js-yaml'
import { z } from 'zod'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const step = z.object({
  uses: z.string().optional(), run: z.string().optional(),
  'working-directory': z.string().optional(),
  with: z.object({ path: z.string().optional() }).loose().optional(),
}).loose()
const workflowSchema = z.object({ jobs: z.record(z.string(), z.object({ steps: z.array(step) }).loose()) })


it.each(['desktop-publish.yml'])('keeps %s preflights executable before install', (filename) => {
  const workflow = workflowSchema.parse(load(readFileSync(resolve(root, '.github/workflows', filename), 'utf8')))
  let preflights = 0
  for (const job of Object.values(workflow.jobs)) {
    const checkout = job.steps.find(entry => entry.uses?.startsWith('actions/checkout@'))
    const checkoutRoot = resolve(root, checkout?.with?.path ?? '.')
    for (const [index, entry] of job.steps.entries()) {
      if (!entry.run?.startsWith('node apps/desktop-publisher/src/preflight-')) continue
      preflights++
      const directory = relative(checkoutRoot, resolve(root, entry['working-directory'] ?? '.'))
      expect(directory).toBe('')
      expect(existsSync(resolve(root, entry.run.split(' ')[1]!))).toBe(true)
      expect(index).toBeLessThan(job.steps.findIndex(candidate => candidate.run?.includes(' install ')))
    }
  }
  expect(preflights).toBe(5)
})
