import { useId } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * The Fiwen mark: a rounded square painted in the host text color with the
 * letter F knocked out, so the surface color shows through the glyph.
 * @param props - Host-supplied mark size and optional geometry class.
 * @returns the Fiwen mark SVG.
 */
function FiwenMark({ size, className }: HeroBrandMarkOwnerProps) {
  // The knocked-out F shares one <mask> per painted rect, so the mask id must
  // be unique per mounted mark; useId keeps parallel sidebar and hero marks
  // from pointing at each other's mask.
  const maskId = useId().replaceAll(':', '')
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <mask id={maskId}>
      <rect width="24" height="24" fill="white" />
      <rect x="7" y="5" width="3" height="14" fill="black" />
      <rect x="7" y="5" width="10" height="3" fill="black" />
      <rect x="7" y="10.5" width="8" height="3" fill="black" />
    </mask>
    <rect width="24" height="24" rx="6" fill="currentColor" mask={`url(#${maskId})`} />
  </svg>
}

/**
 * Render the Fiwen mark at the size the sidebar brand seat requests.
 * @param props - Host-supplied mark size.
 * @returns the Fiwen sidebar mark.
 */
export function FiwenBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <FiwenMark size={size} />
}

/**
 * Render the Fiwen mark inside the conversation hero, preserving the host's
 * mark geometry through its class.
 * @param props - Host-supplied hero mark presentation.
 * @returns the Fiwen hero mark.
 */
export function FiwenHeroBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <FiwenMark size={size} className={className} />
}

/**
 * Render the localized product name; the shell's brand-name seat supplies the
 * wordmark size and weight.
 * @param props - the `ui-brand-fiwen` dictionary bound by the registration.
 * @returns the localized Fiwen product name.
 */
export function FiwenBrandName({ t }: PropsRuntime<'sidebar.brand.name'> & PropsLocale<'ui-brand-fiwen'>) {
  return <span>{t('name')}</span>
}
