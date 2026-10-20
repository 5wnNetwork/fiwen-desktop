/**
 * Browser-safe failure vocabulary and view shapes of the configuration
 * surfaces this package serves. The redacted views themselves live with their
 * seam in `@deepseek-ai/dsh-settings/types`, whose Cordis event declarations
 * already register that file for the Client compilation face.
 *
 * @module @deepseek-ai/dsh-api-settings-controller/types
 */

import type { AuthorizationEntry } from '@deepseek-ai/dsh-authorization/types'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * Every seam refusal that is not a stale write: an unregistered or malformed
     * namespace, a read-only provider, schema validation, storage.
     */
    'settings/rejected': { readonly ns: string }
    /**
     * The stored revision moved after the caller read it. Its own outcome rather
     * than an invalid request: the caller must re-read and re-apply.
     */
    'settings/conflict': { readonly ns: string; readonly expected: number; readonly actual: number }
    /**
     * The provider refused a valid credential write, for example because the
     * stored document no longer parses. The details name only the reference,
     * never the value.
     */
    'credential/rejected': { readonly ref: string }
    /**
     * An authorization attempt or write failed after its request was
     * validated: no flow for the key, an unknown method, another attempt in
     * flight, or the flow itself failing. The message carries the seam's own
     * diagnostic, which surfaces show verbatim; the details name only the
     * record key, never the grant material.
     */
    'authorization/rejected': { readonly key: string }
  }
}

/** Confirmation that the settings document was handed to the native editor. */
export interface SettingsDocumentOpenValue {
  readonly opened: true
}

/** One registered authorization flow as a provider-settings row sees it. */
export interface AuthorizationEntryView extends AuthorizationEntry {
  /** Whether a credential record for this key is stored — the row's signed-in state. */
  readonly configured: boolean
}

/** One credential record's flow and stored-credential state. */
export interface AuthorizationDescribeView {
  /** The record addressed. */
  readonly key: CredentialKey
  /** The flow registered for the key, absent when nothing claims it. */
  readonly entry?: AuthorizationEntryView
  /** Whether a credential record for this key is stored. */
  readonly configured: boolean
}
