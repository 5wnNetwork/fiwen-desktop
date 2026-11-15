/**
 * The Fiwen web search settings card: one page stating that search and page
 * fetching run on the deployment's own service behind the signed-in account,
 * so the official provider, key, endpoint, and billing controls do not apply.
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Props the renderer binds for this Plugins-page card. */
export type WebSearchSettingsCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'ui-settings-web-search-fiwen'>

/**
 * Render the page's one-liner or its explanation.
 * @param props - the view asked for and this card's locale copy.
 * @returns the one-liner for a summary, else the explanation and its note.
 */
export function WebSearchSettingsCard(props: WebSearchSettingsCardProps) {
  const { t } = props
  if (props.view === 'summary') return t('description')
  return (
    <>
      <p>{t('description')}</p>
      <p>{t('note')}</p>
    </>
  )
}
