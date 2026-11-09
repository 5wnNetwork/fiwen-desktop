/**
 * Offer the payloads the installer omitted, then install what the user accepts.
 * Runs once the first window exists so the prompt has a parent and the download can
 * report progress without blocking startup.
 */
import { dialog, type BrowserWindow } from 'electron'
import type { DesktopMessages } from './locale.ts'
import {
  installOptionalPayload, missingOptionalPayloads, readOptionalPayloads, type OptionalPayload,
} from './optional-payloads.ts'

/** Dependencies the caller owns: where resources live, copy, and window access. */
export interface PayloadInstallOptions {
  /** Installed application's resources directory. */
  readonly resourcesDirectory: string
  /** Current locale's message dictionary. */
  readonly messages: DesktopMessages
  /** The window a modal prompt attaches to, when one exists. */
  readonly parent: () => BrowserWindow | undefined
  /** Archive fetcher; injected so tests need no network. */
  readonly download?: (url: string) => Promise<Response>
}

/**
 * Ask once whether to install the missing payloads, then install the accepted ones.
 * @param options - Resources directory, messages, window accessor, and an injectable fetcher.
 * @returns Ids of the payloads present once the call settles.
 */
export async function offerOptionalPayloads(options: PayloadInstallOptions): Promise<readonly string[]> {
  const declared = await readOptionalPayloads(options.resourcesDirectory)
  if (declared.length === 0) return []
  const { missing, bytes } = missingOptionalPayloads(options.resourcesDirectory, declared)
  if (missing.length === 0) return declared.map(payload => payload.id)

  const parent = options.parent()
  const answer = await dialog.showMessageBox({
    type: 'question',
    title: options.messages.payloadTitle,
    message: options.messages.payloadOffer
      .replace('{size}', `${(bytes / (1024 * 1024)).toFixed(0)} MB`)
      .replace('{features}', missing.map(payload => payload.title).join(', ')),
    buttons: [options.messages.payloadDownload, options.messages.later],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    ...(parent === undefined ? {} : { parent }),
  })
  if (answer.response !== 0) return declared.filter(payload => !missing.includes(payload)).map(payload => payload.id)

  const installed: string[] = []
  for (const payload of missing) {
    try {
      await installWithProgress(options, payload)
      installed.push(payload.id)
    } catch {
      await reportFailure(options)
      break
    }
  }
  return installed
}

/**
 * Install one payload while the parent window carries the progress bar.
 * @param options - Caller-owned dependencies.
 * @param payload - Payload to install.
 * @returns Completion once the payload is in place.
 */
async function installWithProgress(options: PayloadInstallOptions, payload: OptionalPayload): Promise<void> {
  const window = options.parent()
  try {
    await installOptionalPayload(options.resourcesDirectory, payload, options.download,
      (received, total) => {
        if (window === undefined || window.isDestroyed()) return
        window.setProgressBar(total === 0 ? 2 : Math.min(1, received / total))
      })
  } finally {
    if (window !== undefined && !window.isDestroyed()) window.setProgressBar(-1)
  }
}

/**
 * Tell the user an install failed, without hiding the reason.
 * @param options - Caller-owned dependencies.
 * @returns Completion once the dialog is dismissed.
 */
async function reportFailure(options: PayloadInstallOptions): Promise<void> {
  const parent = options.parent()
  await dialog.showMessageBox({
    type: 'error',
    title: options.messages.payloadTitle,
    message: options.messages.payloadFailed,
    ...(parent === undefined ? {} : { parent }),
  })
}
