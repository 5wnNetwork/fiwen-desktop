/** Copy owned by the Fiwen web search settings card. */

/** Simplified Chinese copy. */
export const zh = {
  title: '网络搜索',
  description: '搜索与网页内容抓取在你已登录的 Fiwen 服务上运行。',
  note: '无需配置密钥或接口地址。',
}

/** Keys owned by the `ui-settings-web-search-fiwen` namespace. */
export type WebSearchSettingsKey = keyof typeof zh

/** English copy. */
export const en: Record<WebSearchSettingsKey, string> = {
  title: 'Web search',
  description: 'Search and page fetching run on your signed-in Fiwen service.',
  note: 'There is no key or endpoint to configure.',
}

/** Japanese copy. */
export const ja: Record<WebSearchSettingsKey, string> = {
  title: 'ウェブ検索',
  description: '検索とページ取得は、サインイン済みの Fiwen サービス上で実行されます。',
  note: 'キーやエンドポイントの設定は不要です。',
}

/** Spanish copy. */
export const es: Record<WebSearchSettingsKey, string> = {
  title: 'Búsqueda web',
  description: 'La búsqueda y la carga de páginas se ejecutan en tu servicio de Fiwen con la sesión iniciada.',
  note: 'No hay clave ni dirección que configurar.',
}

/** French copy. */
export const fr: Record<WebSearchSettingsKey, string> = {
  title: 'Recherche web',
  description: 'La recherche et la récupération de pages s’exécutent sur votre service Fiwen, avec votre session ouverte.',
  note: 'Il n’y a ni clé ni adresse à configurer.',
}

/** German copy. */
export const de: Record<WebSearchSettingsKey, string> = {
  title: 'Websuche',
  description: 'Suche und Seitenabruf laufen mit Ihrer angemeldeten Sitzung im Fiwen-Dienst.',
  note: 'Es gibt keinen Schlüssel und keinen Endpunkt zu konfigurieren.',
}

/** Russian copy. */
export const ru: Record<WebSearchSettingsKey, string> = {
  title: 'Веб-поиск',
  description: 'Поиск и загрузка страниц выполняются в вашей учётной записи сервиса Fiwen.',
  note: 'Ключ и адрес указывать не нужно.',
}

/** Portuguese copy. */
export const pt: Record<WebSearchSettingsKey, string> = {
  title: 'Pesquisa na web',
  description: 'A pesquisa e o carregamento de páginas são executados no seu serviço Fiwen com a sessão iniciada.',
  note: 'Não há chave nem endereço para configurar.',
}

/** Vietnamese copy, the deployment default. */
export const vi: Record<WebSearchSettingsKey, string> = {
  title: 'Tìm kiếm web',
  description: 'Tìm kiếm và tải nội dung web chạy trên dịch vụ Fiwen bằng tài khoản đã đăng nhập của bạn.',
  note: 'Không cần cấu hình khóa hay địa chỉ.',
}
