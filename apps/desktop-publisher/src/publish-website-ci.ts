/** Actions entrypoint for the independently recoverable website installer upload job. */
import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { readDesktopPublishConfig, readDesktopUploadCredentials } from './desktop-publish-config.ts'
import { desktopReleasesRoot } from './desktop-releases-root.ts'
import { readRetainedDesktopManifest, retainedDesktopPath } from './desktop-release-store.ts'
import { prepareWebsiteInstaller, uploadWebsiteInstaller } from './desktop-website-installer.ts'
import { desktopPublishS3 } from './desktop-publish-s3.ts'
import { withDesktopChannelLock } from './desktop-publish-record.ts'
import { desktopPublicationFailure } from './desktop-publication-failure.ts'

const routeSchema = z.object({ runId: z.string().regex(/^[1-9]\d*$/u), attempt: z.string().regex(/^[1-9]\d*$/u),
  commit: z.string().regex(/^[a-f0-9]{40}$/u), runnerName: z.string(), runnerLabel: z.string(), sourceRef: z.string(),
  channel: z.enum(['nightly', 'stable']), target: z.enum(['mac-arm64', 'mac-x64', 'win-x64']), preset: z.literal('production') })
const stateSchema = z.object({ approval: z.string(), upload: z.enum(['pending', 'upload-intent', 'uploaded']),
  uploadConfirmed: z.boolean().optional() })

/**
 * Bind website approval to the retained manifest and exact production bucket.
 * @param manifest Retained build metadata already matched to GitHub evidence.
 * @param bucket Production S3 destination.
 * @returns Non-secret digest passed through the production approval job.
 */
export function websiteApproval(manifest: unknown, bucket: string): string {
  return createHash('sha256').update(JSON.stringify({ manifest, bucket })).digest('hex')
}

/**
 * Upload the fixed website installer, using a publication-run-owned journal; the CDN in front of storage owns revalidation.
 * @param env Actions identity, approved build and machine configuration.
 * @returns Resolves after the upload is confirmed or an identical object is reused.
 */
export async function publishWebsiteCi(env: NodeJS.ProcessEnv): Promise<void> {
  const route = routeSchema.parse(JSON.parse(env.DESKTOP_PUBLISH_ROUTE || '{}'))
  if (env.RUNNER_NAME !== route.runnerName || !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID || '')
    || !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT || '')) throw new Error('website publication: invalid Actions identity or original machine')
  const root = desktopReleasesRoot(env)
  const manifest = await readRetainedDesktopManifest(root, route.runId, route.attempt)
  const config = await readDesktopPublishConfig(z.string().parse(env.DSH_PACKAGING_CONFIG_DIR), 'production')
  const approval = websiteApproval(manifest, config.bucket)
  if (!env.DESKTOP_WEBSITE_APPROVAL || env.DESKTOP_WEBSITE_APPROVAL !== approval) throw new Error('website publication: approved build or destination changed')
  const directory = join(dirname(root), 'upload-records', `website-${env.GITHUB_RUN_ID}-${route.target}`)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const stateFile = join(directory, 'state.json')
  let state: z.infer<typeof stateSchema> = { approval, upload: 'pending' }
  try { state = stateSchema.parse(JSON.parse(await readFile(stateFile, 'utf8'))) }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }
  if (state.approval !== approval) throw new Error('website publication: journal belongs to another approved build')
  const save = async () => {
    const temporary = join(directory, `.state-${randomUUID()}.json`)
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { flag: 'wx', mode: 0o600, flush: true })
    await rename(temporary, stateFile)
  }
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `record=${directory}\n`)
  const credentials = await readDesktopUploadCredentials(config)
  const installer = await prepareWebsiteInstaller(retainedDesktopPath(root, route.runId, route.attempt), manifest, route,
    env.GITHUB_REPOSITORY || '', config)
  const [installerArtifact] = installer.plan.artifacts
  if (installerArtifact === undefined) throw new Error('website publication: installer plan names no artifact')
  try {
    const outcome = await withDesktopChannelLock(join(dirname(root), 'publish-locks'), `${config.bucket}/${installerArtifact.key}`, async () => {
      const previouslyUploaded = state.uploadConfirmed === true || state.upload === 'uploaded'
      return uploadWebsiteInstaller(installer, credentials, desktopPublishS3(installer.plan, credentials), async (event) => {
        state = event === 'upload-intent'
          ? { approval: state.approval, upload: event, uploadConfirmed: previouslyUploaded }
          : { ...state, upload: event, uploadConfirmed: true }
        await save()
      }, { previouslyUploaded })
    })
    const disposition = outcome === 'present' ? 'identical remote bytes and download filename confirmed; skipped' : 'uploaded'
    const text = `Website installer ${disposition}: ${installer.plan.publicUrl}; version ${installer.plan.version}\n`
    process.stdout.write(text)
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text)
  } finally { await installer.handle.close() }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'upload') throw new Error('Usage: publish-website-ci.ts upload')
    await publishWebsiteCi(process.env)
  } catch (error) {
    process.stderr.write(`${JSON.stringify(desktopPublicationFailure(error, 'website publication'))}\n`)
    process.exitCode = 1
  }
}
