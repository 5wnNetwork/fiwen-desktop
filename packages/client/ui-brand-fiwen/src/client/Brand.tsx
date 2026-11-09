import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import logo from './assets/logo.png'

/**
 * The Fiwen mark: the 5wn logo tile, loaded from this package's assets.
 * @param props - Host-supplied mark size and optional geometry class.
 * @returns the Fiwen mark image.
 */
function FiwenMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <img src={logo} width={size} height={size} className={className} alt="" aria-hidden="true" />
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
