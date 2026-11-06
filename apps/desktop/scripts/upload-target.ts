/** Upload validated Desktop update artifacts or a fixed installer to the deployment S3 bucket. */

import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { DesktopPackageTargetName } from './package-target.ts'
import { createDesktopS3 } from './desktop-s3.ts'
import { requiredEnvironmentValue, resolveDesktopAutoUpdateEnvironment, resolveDesktopUploadConfig } from './desktop-auto-update-environment.mjs'
import { desktopTargetPlatform } from './desktop-build-paths.mjs'
import { loadDesktopPackageEnvironment } from './desktop-package-environment.mjs'
import { createDesktopUploadPlan, type DesktopUploadPlan } from './desktop-upload-plan.ts'
import { desktopReleaseTag, tagDesktopRelease } from './desktop-release-tag.ts'
import { uploadDesktopRelease } from './desktop-upload-run.ts'

const SUPPORTED_TARGETS = new Set<DesktopPackageTargetName>(['mac-arm64', 'mac-x64', 'win-x64'])

function targetName(value: string): DesktopPackageTargetName {
  if (!SUPPORTED_TARGETS.has(value as DesktopPackageTargetName)) {
    throw new DesktopUploadUsageError(`desktop upload: unsupported target ${JSON.stringify(value)}; expected ${[...SUPPORTED_TARGETS].join(', ')}`)
  }
  return value as DesktopPackageTargetName
}

/** Invalid command arguments or release configuration, reported before network writes. */
class DesktopUploadUsageError extends Error {}

/**
 * Use the credential launcher's selected deployment only when it matches the packaged release destination.
 * @param fileEnvironment Target dotenv settings that own the release destination.
 * @param injectedEnvironment Child environment containing the DPAPI-decrypted credential pair.
 * @param selected Deployment authorized by the launcher operator.
 * @param bucket Bucket authorized by the launcher operator.
 * @param target Packaged target being uploaded.
 * @returns Release settings with only the selected credential pair replaced.
 */
export function resolveCredentialUploadEnvironment(
  fileEnvironment: NodeJS.ProcessEnv, injectedEnvironment: NodeJS.ProcessEnv,
  selected: 'test' | 'production', bucket: string,
  target: DesktopPackageTargetName,
): NodeJS.ProcessEnv {
  const { platform, arch } = desktopTargetPlatform(target)
  const destination = resolveDesktopUploadConfig(fileEnvironment, platform, arch)
  if (destination.environment !== selected || destination.bucket !== bucket) {
    throw new DesktopUploadUsageError('desktop upload: credential launcher deployment or bucket differs from the packaged release destination')
  }
  if (injectedEnvironment.DSH_DESKTOP_AUTO_UPDATE_ENV !== selected
    || injectedEnvironment[`${selected === 'test' ? 'DOWNLOAD_TEST' : 'DOWNLOAD_PROD'}_S3_BUCKET`] !== bucket) {
    throw new DesktopUploadUsageError('desktop upload: credential launcher environment differs from its explicit arguments')
  }
  return {
    ...fileEnvironment,
    [destination.accessKeyIdEnvName]: requiredEnvironmentValue(injectedEnvironment, destination.accessKeyIdEnvName),
    [destination.secretAccessKeyEnvName]: requiredEnvironmentValue(injectedEnvironment, destination.secretAccessKeyEnvName),
  }
}

/**
 * Upload the selected target and record a release tag only for production update uploads.
 * @param args Target and upload options from the command line.
 * @returns Resolves after upload and any release-tag attempt complete.
 */
export async function uploadDesktopTarget(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: {
    latest: { type: 'boolean' },
    'credential-launcher': { type: 'boolean' }, environment: { type: 'string' }, bucket: { type: 'string' },
  } })
  const target = positionals[0]
  if (target === undefined || positionals.length !== 1) {
    throw new DesktopUploadUsageError('desktop upload: expected exactly one target')
  }
  const name = targetName(target)
  let fileEnvironment: NodeJS.ProcessEnv
  try {
    fileEnvironment = loadDesktopPackageEnvironment(desktopTargetPlatform(name).platform)
  } catch {
    // Loader diagnostics can quote dotenv contents, which may hold credentials.
    throw new DesktopUploadUsageError('Cannot load target dotenv; check the target dotenv file and release settings.')
  }
  const launcher = values['credential-launcher'] === true
  if (launcher ? values.environment === undefined || values.bucket === undefined
    : values.environment !== undefined || values.bucket !== undefined) {
    throw new DesktopUploadUsageError('desktop upload: credential launcher requires an explicit environment and bucket')
  }
  if (values.environment !== undefined && values.environment !== 'test' && values.environment !== 'production') {
    throw new DesktopUploadUsageError('desktop upload: credential launcher environment must be test or production')
  }
  const environment = launcher
    ? resolveCredentialUploadEnvironment(fileEnvironment, process.env, values.environment as 'test' | 'production', values.bucket!, name)
    : fileEnvironment
  try {
    resolveDesktopAutoUpdateEnvironment(environment)
  } catch {
    // The resolver message names the invalid value; the usage message states the accepted ones.
    throw new DesktopUploadUsageError('DSH_DESKTOP_AUTO_UPDATE_ENV must be "test" or "production".')
  }
  const plan = await createDesktopUploadPlan(name, { environment, latest: values.latest === true })
  const s3 = createDesktopS3({
    accessKeyId: requiredEnvironmentValue(environment, plan.accessKeyIdEnvName),
    secretAccessKey: requiredEnvironmentValue(environment, plan.secretAccessKeyEnvName),
    endpoint: plan.endpoint, region: plan.region,
  })
  process.stdout.write(`desktop upload: ${plan.target} ${plan.version} -> ${plan.publicUrl}\n`)
  await uploadDesktopRelease(plan, s3, resolve(import.meta.dirname, '../.desktop-build/upload-records'))
  if (plan.environment === 'production' && !values.latest) recordProductionRelease(plan)
}

/**
 * Tag the commit an external release was packaged from, after its artifacts are public.
 * @param plan Completed production upload.
 */
function recordProductionRelease(plan: DesktopUploadPlan): void {
  const tag = desktopReleaseTag(plan.version)
  if (plan.commit === undefined) {
    process.stdout.write(`desktop upload: this package was built before builds recorded their commit; tag it by hand as ${tag}\n`)
    return
  }
  if (plan.dirty === true) {
    // A tag would name a commit whose tree is not what the users received.
    process.stderr.write(`desktop upload: packaged from ${plan.commit} with uncommitted changes, so ${tag} was not created\n`)
    return
  }
  const result = tagDesktopRelease({ version: plan.version, commit: plan.commit, repositoryRoot: resolve(import.meta.dirname, '../../..') })
  if (result.status === 'failed') {
    process.stderr.write(`desktop upload: the release is published but ${result.tag} was not recorded: ${result.detail ?? 'unknown error'}\n`)
    if (result.recovery !== undefined) {
      process.stderr.write(`desktop upload: record it with: ${result.recovery.join(' && ')}\n`)
    }
    return
  }
  process.stdout.write(`desktop upload: ${result.tag} ${result.status === 'created' ? 'records' : 'already recorded'} ${plan.commit}\n`)
}

/**
 * Report command failures without exposing raw storage or SDK exceptions.
 * @param args Target and options forwarded by the package command or credential launcher.
 * @returns Resolves after reporting any failure and setting the process exit status.
 */
export async function runDesktopUploadCommand(args: string[]): Promise<void> {
  try {
    await uploadDesktopTarget(args)
  } catch (error) {
    const usage = error instanceof DesktopUploadUsageError
      || (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS_'))
    const message = usage
      ? `desktop upload: ${error instanceof DesktopUploadUsageError ? error.message : 'invalid arguments'}. Usage: upload-target.ts <target> [--latest]; targets: mac-arm64, mac-x64, win-x64.`
      : 'desktop upload: failed; inspect the printed record directory if allocated. No automatic retry; reconcile remote state before another upload.'
    // The DPAPI launcher suppresses raw stderr; these diagnostics contain no SDK details.
    const output = args.includes('--credential-launcher') ? process.stdout : process.stderr
    output.write(`${message}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  void runDesktopUploadCommand(process.argv.slice(2))
}
