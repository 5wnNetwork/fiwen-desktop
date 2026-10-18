/** Page-bootstrap options shared by the Host and Client halves. */

import z from '@deepseek-ai/schemastery'
import { LOCALE_ID_PATTERN } from './locale-settings.ts'

/** Deployment choices projected to the browser through the page bootstrap. */
export interface BootConfig {
  /** Deployment default locale applied ahead of browser detection while registered. */
  defaultLocale?: string
}

/** Validate the public page-bootstrap payload. */
export const BootConfig: z<Partial<BootConfig>, BootConfig> = z.object({
  defaultLocale: z.string().pattern(LOCALE_ID_PATTERN).required(false),
})

/** Page-global key carrying only the public deployment options. */
export const LOCALE_CONFIG_GLOBAL = '__DSH_LOCALE_CONFIG__'
