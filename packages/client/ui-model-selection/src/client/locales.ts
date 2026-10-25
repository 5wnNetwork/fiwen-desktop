/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` intentionally matches `trigger.fallback` but remains a
 * separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'provider.account': 'Fiwen 账号',
  'command.label': '模型',
  'command.description': '选择本会话使用的模型',
  'option.loadError': '目录加载失败：{message}',
  'trigger.fallback': '请选择模型',
  'trigger.loading': '正在加载模型…',
  'trigger.selectAria': '请选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'menu.aria': '模型、推理等级、省流模式与账号',
  'menu.model': '模型',
  'menu.effort': '推理等级',
  'menu.saver': '省流模式',
  'menu.account': '账号',
  'account.default': '默认',
  'effort.providerDefault': 'Default',
  'saver.mode.default': '默认',
  'saver.mode.simple': '简单',
  'saver.mode.disabled': '关闭',
  'saver.mode.coding-low': '编程（低）',
  'saver.mode.coding-high': '编程（高）',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失败：{message}',
  'error.sessionInUse': '当前会话已被占用，可能是其他正在运行的 DSH 导致的（如其他 fwnd web、桌面端），请退出其他正在运行的 DSH 后重试。',
  'action.reload': '重新加载',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'search.placeholder': '搜索模型…',
  'search.clear': '清除搜索',
  'search.empty': '没有匹配的模型。',
  'empty.models': '暂无可用模型',
  'empty.efforts': '当前模型未提供推理等级。',
  'empty.savers': '当前模型未提供省流模式。',
  'empty.accounts': '没有已登录的账号。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'provider.account': 'Fiwen account',
  'command.label': 'Model',
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.loading': 'Loading models…',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model, reasoning effort, token saver, and account',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'menu.saver': 'Token saver',
  'menu.account': 'Account',
  'account.default': 'Default',
  'effort.providerDefault': 'Default',
  'saver.mode.default': 'Default',
  'saver.mode.simple': 'Simple',
  'saver.mode.disabled': 'Disabled',
  'saver.mode.coding-low': 'Coding (low)',
  'saver.mode.coding-high': 'Coding (high)',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'error.sessionInUse': 'This session is already in use, possibly by another running DSH instance (such as fwnd web or the desktop app). Quit other running DSH instances and try again.',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'search.placeholder': 'Search models…',
  'search.clear': 'Clear search',
  'search.empty': 'No matching models.',
  'empty.models': 'No models available.',
  'empty.efforts': 'This model provides no reasoning effort levels.',
  'empty.savers': 'This model provides no token saver modes.',
  'empty.accounts': 'No signed-in accounts.',
} satisfies Record<ModelKey, string>
