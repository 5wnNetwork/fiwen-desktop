/**
 * Language-pack coverage gate: every upstream English dictionary key must have
 * a Vietnamese translation and carry the same `{placeholder}` set, so upstream
 * syncs that add copy surface here as a failing list instead of silent gaps.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { en as settingsLocaleEn } from '@deepseek-ai/dsh-client-locale/src/locales/settings.ts'
import { en as agentPresetEn } from '@deepseek-ai/dsh-client-ui-agent-preset/src/client/locales.ts'
import { en as approvalEn } from '@deepseek-ai/dsh-client-ui-approval/src/client/locales.ts'
import { en as chatEn } from '@deepseek-ai/dsh-client-ui-chat/src/client/locale.ts'
import { en as commandsEn } from '@deepseek-ai/dsh-client-ui-commands/src/client/locales.ts'
import { en as conversationEn } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import { en as modelLabelEn } from '@deepseek-ai/dsh-client-ui-deepseek-model-label-1017/src/client/locales.ts'
import { en as deliverablesEn } from '@deepseek-ai/dsh-client-ui-deliverables/src/client/locales.ts'
import { en as goalEn } from '@deepseek-ai/dsh-client-ui-goal/src/client/locales.ts'
import { en as inputTriggerEn } from '@deepseek-ai/dsh-client-ui-input-trigger/src/client/locales.ts'
import { en as jobsEn } from '@deepseek-ai/dsh-client-ui-jobs/src/client/locales.ts'
import { en as shortcutsLayoutEn } from '@deepseek-ai/dsh-client-ui-layout/src/client/shortcut-locales.ts'
import { en as messageFeedbackEn } from '@deepseek-ai/dsh-client-ui-message-feedback/src/client/locales.ts'
import { en as modelEn } from '@deepseek-ai/dsh-client-ui-model-selection/src/client/locales.ts'
import { en as openInAppEn } from '@deepseek-ai/dsh-client-ui-open-in-app/src/client/locales.ts'
import { accessEn, en as permissionEn } from '@deepseek-ai/dsh-client-ui-permission-presets/src/client/locales.ts'
import { en as planEn } from '@deepseek-ai/dsh-client-ui-plan/src/client/locales.ts'
import { en as pluginManagerEn } from '@deepseek-ai/dsh-client-ui-plugin-manager/src/client/locales.ts'
import { en as pluginMarketEn } from '@deepseek-ai/dsh-client-ui-plugin-market/src/client/locales.ts'
import { en as referenceEn } from '@deepseek-ai/dsh-client-ui-reference/src/client/locales.ts'
import { en as scheduleCatalogEn } from '@deepseek-ai/dsh-client-ui-schedule/src/client/locales.ts'
import { en as taskManagerEn } from '@deepseek-ai/dsh-client-ui-schedule/src/client/task-manager-locales.ts'
import { en as secretMaskEn } from '@deepseek-ai/dsh-client-ui-secret-mask/src/client/locales.ts'
import { en as settingsAccountEn } from '@deepseek-ai/dsh-client-ui-settings-account/src/client/locales.ts'
import { en as settingsAgentLoopEn } from '@deepseek-ai/dsh-client-ui-settings-agent-loop/src/client/locales.ts'
import { en as settingsEn } from '@deepseek-ai/dsh-client-ui-settings-general/src/client/locales.ts'
import { en as settingsModelsEn } from '@deepseek-ai/dsh-client-ui-settings-models/src/client/locales.ts'
import { en as settingsPluginInventoryEn } from '@deepseek-ai/dsh-client-ui-settings-plugin-inventory/src/client/locales.ts'
import { en as settingsPluginsEn } from '@deepseek-ai/dsh-client-ui-settings-plugins/src/client/locales.ts'
import { en as settingsSessionLogEn } from '@deepseek-ai/dsh-client-ui-settings-session-log/src/client/locales.ts'
import { en as settingsShellEn } from '@deepseek-ai/dsh-client-ui-settings-shell/src/client/locales.ts'
import { en as settingsSubagentEn } from '@deepseek-ai/dsh-client-ui-settings-subagent/src/client/locales.ts'
import { en as settingsWebSearchEn } from '@deepseek-ai/dsh-client-ui-settings-web-search/src/client/locales.ts'
import { en as shortcutsEn } from '@deepseek-ai/dsh-client-ui-shortcuts/src/client/locales.ts'
import { en as sidebarEn } from '@deepseek-ai/dsh-client-ui-sidebar/src/client/locales.ts'
import { en as sidebarBrowserEn } from '@deepseek-ai/dsh-client-ui-sidebar-browser/src/client/locales.ts'
import { en as sidebarCodePreviewEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/code/locales.ts'
import { en as sidebarExcelEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/excel/locales.ts'
import { en as documentHtmlEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/html/locales.ts'
import { en as sidebarImageEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/image/locales.ts'
import { en as documentPreviewEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/locales.ts'
import { en as documentMarkdownEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/markdown/locales.ts'
import { en as sidebarOfficeEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/office/locales.ts'
import { en as sidebarPdfEn } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/pdf/locales.ts'
import { en as sidebarFilesEn } from '@deepseek-ai/dsh-client-ui-sidebar-files/src/client/locales.ts'
import { en as sidebarRightEn } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/locales.ts'
import { en as sidebarTerminalEn } from '@deepseek-ai/dsh-client-ui-sidebar-terminal/src/client/locales.ts'
import { en as skillEn } from '@deepseek-ai/dsh-client-ui-skill/src/client/locales.ts'
import { en as subagentEn } from '@deepseek-ai/dsh-client-ui-subagent/src/client/locales.ts'
import { en as settingsThemeEn } from '@deepseek-ai/dsh-client-ui-theme/src/client/locales.ts'
import { en as trajectoryEn } from '@deepseek-ai/dsh-client-ui-trajectory/src/client/locales.ts'
import { en as questionEn } from '@deepseek-ai/dsh-client-ui-user-questions/src/client/locales.ts'
import { en as workflowRunEn } from '@deepseek-ai/dsh-client-ui-workflow-run/src/client/locales.ts'
import { en as workspaceEn } from '@deepseek-ai/dsh-client-ui-workspace/src/client/locales.ts'
import { en as agentTeamEn } from '@deepseek-ai/dsh-experimental-client-ui-agent-team/src/client/locales.ts'
import { en as claudeCodeModsEn } from '@deepseek-ai/dsh-experimental-client-ui-claude-code-mods/src/client/locales.ts'
import { en as cotTranslationEn } from '@deepseek-ai/dsh-experimental-client-ui-cot-translation/src/client/locales.ts'
import { en as voiceInputEn } from '@deepseek-ai/dsh-experimental-client-ui-voice-input/src/client/locales.ts'
import { en as inspectorPanelEn } from '@deepseek-ai/dsh-experimental-inspector/src/client/bottom/locales.ts'
import { en as sessionInspectorEn } from '@deepseek-ai/dsh-experimental-session-inspector/src/client/locales.ts'
import { en as cordisEn } from '@deepseek-ai/dsh-client-ui-cordis/src/client/locales.ts'
import { en as sessionLogExportEn } from '@deepseek-ai/dsh-session-log-export/src/client/locales.ts'

import { VI_DICTIONARIES } from '../src/locales/index.ts'

type Dict = Readonly<Record<string, string>>

/** Upstream `directory-browser` keeps its dictionaries inline in apply(); the
 * English dictionary is read back out of the source so upstream edits surface here. */
function directoryBrowserEn(): Dict {
  const require = createRequire(import.meta.url)
  const pkg = require.resolve('@deepseek-ai/dsh-client-ui-directory-picker-browse/package.json')
  const source = readFileSync(join(dirname(pkg), 'src/client/index.ts'), 'utf8')
  const block = source.match(/\['en', \{(?<body>[\s\S]*?)\}\]/)?.groups?.['body']
  if (block === undefined) throw new Error('directory-browser en dictionary not found')
  const unescape = (text: string) => text.replaceAll("\\'", "'").replaceAll('\\\\', '\\')
  const entries = [...block.matchAll(/'((?:[^'\\]|\\.)*)':\s*'((?:[^'\\]|\\.)*)'/g)]
    .map((m) => {
      const key = m[1]
      const value = m[2]
      if (key === undefined || value === undefined) throw new Error('malformed dictionary entry')
      return [unescape(key), unescape(value)] as const
    })
  if (entries.length === 0) throw new Error('directory-browser en dictionary is empty')
  return Object.fromEntries(entries)
}

const PAIRS: Record<string, { en: Dict; vi: Dict }> = {
  'common': { en: commonEn, vi: VI_DICTIONARIES['common'] },
  'settings.locale': { en: settingsLocaleEn, vi: VI_DICTIONARIES['settings.locale'] },
  'settings.agentPreset': { en: agentPresetEn, vi: VI_DICTIONARIES['settings.agentPreset'] },
  'agent-team': { en: agentTeamEn, vi: VI_DICTIONARIES['agent-team'] },
  'approval': { en: approvalEn, vi: VI_DICTIONARIES['approval'] },
  'chat': { en: chatEn, vi: VI_DICTIONARIES['chat'] },
  'claude-code-mods': { en: claudeCodeModsEn, vi: VI_DICTIONARIES['claude-code-mods'] },
  'command': { en: commandsEn, vi: VI_DICTIONARIES['command'] },
  'conversation': { en: conversationEn, vi: VI_DICTIONARIES['conversation'] },
  'cordis': { en: cordisEn, vi: VI_DICTIONARIES['cordis'] },
  'cotTranslation': { en: cotTranslationEn, vi: VI_DICTIONARIES['cotTranslation'] },
  'deliverables': { en: deliverablesEn, vi: VI_DICTIONARIES['deliverables'] },
  'directory-browser': { en: directoryBrowserEn(), vi: VI_DICTIONARIES['directory-browser'] },
  'documentHtml': { en: documentHtmlEn, vi: VI_DICTIONARIES['documentHtml'] },
  'documentMarkdown': { en: documentMarkdownEn, vi: VI_DICTIONARIES['documentMarkdown'] },
  'sidebarDocumentPreview': { en: documentPreviewEn, vi: VI_DICTIONARIES['sidebarDocumentPreview'] },
  'goal': { en: goalEn, vi: VI_DICTIONARIES['goal'] },
  'slash.menu': { en: inputTriggerEn, vi: VI_DICTIONARIES['slash.menu'] },
  'inspectorPanel': { en: inspectorPanelEn, vi: VI_DICTIONARIES['inspectorPanel'] },
  'job': { en: jobsEn, vi: VI_DICTIONARIES['job'] },
  'feedback': { en: messageFeedbackEn, vi: VI_DICTIONARIES['feedback'] },
  'deepseek-model-label-1017': { en: modelLabelEn, vi: VI_DICTIONARIES['deepseek-model-label-1017'] },
  'model': { en: modelEn, vi: VI_DICTIONARIES['model'] },
  'open-in-app': { en: openInAppEn, vi: VI_DICTIONARIES['open-in-app'] },
  'permission.access': { en: accessEn, vi: VI_DICTIONARIES['permission.access'] },
  'settings.permission': { en: permissionEn, vi: VI_DICTIONARIES['settings.permission'] },
  'plan': { en: planEn, vi: VI_DICTIONARIES['plan'] },
  'pluginManager': { en: pluginManagerEn, vi: VI_DICTIONARIES['pluginManager'] },
  'pluginMarket': { en: pluginMarketEn, vi: VI_DICTIONARIES['pluginMarket'] },
  'reference': { en: referenceEn, vi: VI_DICTIONARIES['reference'] },
  'schedule.catalog': { en: scheduleCatalogEn, vi: VI_DICTIONARIES['schedule.catalog'] },
  'schedule.manager': { en: taskManagerEn, vi: VI_DICTIONARIES['schedule.manager'] },
  'secretMask': { en: secretMaskEn, vi: VI_DICTIONARIES['secretMask'] },
  'session-inspector': { en: sessionInspectorEn, vi: VI_DICTIONARIES['session-inspector'] },
  'session-log-download': { en: sessionLogExportEn, vi: VI_DICTIONARIES['session-log-download'] },
  'settings.account': { en: settingsAccountEn, vi: VI_DICTIONARIES['settings.account'] },
  'settings.agentLoop': { en: settingsAgentLoopEn, vi: VI_DICTIONARIES['settings.agentLoop'] },
  'settings': { en: settingsEn, vi: VI_DICTIONARIES['settings'] },
  'settings.models': { en: settingsModelsEn, vi: VI_DICTIONARIES['settings.models'] },
  'settings.pluginInventory': { en: settingsPluginInventoryEn, vi: VI_DICTIONARIES['settings.pluginInventory'] },
  'settings.plugins': { en: settingsPluginsEn, vi: VI_DICTIONARIES['settings.plugins'] },
  'settings.sessionLog': { en: settingsSessionLogEn, vi: VI_DICTIONARIES['settings.sessionLog'] },
  'settings.shell': { en: settingsShellEn, vi: VI_DICTIONARIES['settings.shell'] },
  'settings.subagent': { en: settingsSubagentEn, vi: VI_DICTIONARIES['settings.subagent'] },
  'settings.webSearch': { en: settingsWebSearchEn, vi: VI_DICTIONARIES['settings.webSearch'] },
  'shortcuts': { en: shortcutsEn, vi: VI_DICTIONARIES['shortcuts'] },
  'shortcuts.layout': { en: shortcutsLayoutEn, vi: VI_DICTIONARIES['shortcuts.layout'] },
  'sidebar': { en: sidebarEn, vi: VI_DICTIONARIES['sidebar'] },
  'sidebarBrowser': { en: sidebarBrowserEn, vi: VI_DICTIONARIES['sidebarBrowser'] },
  'sidebarCodePreview': { en: sidebarCodePreviewEn, vi: VI_DICTIONARIES['sidebarCodePreview'] },
  'sidebarExcel': { en: sidebarExcelEn, vi: VI_DICTIONARIES['sidebarExcel'] },
  'sidebarFiles': { en: sidebarFilesEn, vi: VI_DICTIONARIES['sidebarFiles'] },
  'sidebarImage': { en: sidebarImageEn, vi: VI_DICTIONARIES['sidebarImage'] },
  'sidebarOffice': { en: sidebarOfficeEn, vi: VI_DICTIONARIES['sidebarOffice'] },
  'sidebarPdf': { en: sidebarPdfEn, vi: VI_DICTIONARIES['sidebarPdf'] },
  'sidebarRight': { en: sidebarRightEn, vi: VI_DICTIONARIES['sidebarRight'] },
  'sidebarTerminal': { en: sidebarTerminalEn, vi: VI_DICTIONARIES['sidebarTerminal'] },
  'skill': { en: skillEn, vi: VI_DICTIONARIES['skill'] },
  'subagent': { en: subagentEn, vi: VI_DICTIONARIES['subagent'] },
  'settings.theme': { en: settingsThemeEn, vi: VI_DICTIONARIES['settings.theme'] },
  'trajectory': { en: trajectoryEn, vi: VI_DICTIONARIES['trajectory'] },
  'question': { en: questionEn, vi: VI_DICTIONARIES['question'] },
  'voice-input': { en: voiceInputEn, vi: VI_DICTIONARIES['voice-input'] },
  'workflowRun': { en: workflowRunEn, vi: VI_DICTIONARIES['workflowRun'] },
  'workspace': { en: workspaceEn, vi: VI_DICTIONARIES['workspace'] },
}

/** Placeholder set of one template string (`{name}` occurrences). */
function placeholders(text: string): readonly string[] {
  return Object.freeze([...text.matchAll(/\{[^{}]+\}/g)].map(m => m[0]).sort())
}

describe('vi language pack', () => {
  it('covers every registered namespace', () => {
    expect(Object.keys(VI_DICTIONARIES).sort()).toEqual(Object.keys(PAIRS).sort())
  })

  it('translates every English key', () => {
    const missing: string[] = []
    for (const [ns, { en, vi }] of Object.entries(PAIRS)) {
      for (const key of Object.keys(en)) {
        if (!(key in vi)) missing.push(`${ns}:${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('keeps every {placeholder} identical to English', () => {
    const drifted: string[] = []
    for (const [ns, { en, vi }] of Object.entries(PAIRS)) {
      for (const [key, enText] of Object.entries(en)) {
        const viText = vi[key]
        if (viText === undefined) continue
        if (placeholders(enText).join() !== placeholders(viText).join()) drifted.push(`${ns}:${key}`)
      }
    }
    expect(drifted).toEqual([])
  })

  it('points schedule formatters at the vi locale', () => {
    expect(VI_DICTIONARIES['schedule.catalog']['time.locale']).toBe('vi')
    expect(VI_DICTIONARIES['schedule.manager']['time.locale']).toBe('vi')
  })
})
