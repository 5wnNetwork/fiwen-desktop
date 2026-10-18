/**
 * Vietnamese dictionary table: namespace → dictionary, mirroring every
 * `ctx.locale.register` namespace shipped by the workspace's client plugins.
 */
import type { LocaleDict } from '@deepseek-ai/dsh-client-locale/client'

import { vi as agentPreset } from './agentPreset.ts'
import { vi as agentTeam } from './agentTeam.ts'
import { vi as approval } from './approval.ts'
import { vi as chat } from './chat.ts'
import { vi as claudeCodeMods } from './claudeCodeMods.ts'
import { vi as commands } from './commands.ts'
import { vi as common } from './common.ts'
import { vi as conversation } from './conversation.ts'
import { vi as cordis } from './cordis.ts'
import { vi as cotTranslation } from './cotTranslation.ts'
import { vi as deliverables } from './deliverables.ts'
import { vi as directoryBrowser } from './directoryBrowser.ts'
import { vi as documentHtml } from './documentHtml.ts'
import { vi as documentMarkdown } from './documentMarkdown.ts'
import { vi as documentPreview } from './documentPreview.ts'
import { vi as goal } from './goal.ts'
import { vi as inputTrigger } from './inputTrigger.ts'
import { vi as inspectorPanel } from './inspectorPanel.ts'
import { vi as jobs } from './jobs.ts'
import { vi as messageFeedback } from './messageFeedback.ts'
import { vi as modelLabel1017 } from './modelLabel1017.ts'
import { vi as modelSelection } from './modelSelection.ts'
import { vi as openInApp } from './openInApp.ts'
import { vi as permissionAccess } from './permissionAccess.ts'
import { vi as permissionSettings } from './permissionSettings.ts'
import { vi as plan } from './plan.ts'
import { vi as pluginManager } from './pluginManager.ts'
import { vi as pluginMarket } from './pluginMarket.ts'
import { vi as reference } from './reference.ts'
import { vi as scheduleCatalog } from './scheduleCatalog.ts'
import { vi as secretMask } from './secretMask.ts'
import { vi as sessionInspector } from './sessionInspector.ts'
import { vi as sessionLogExport } from './sessionLogExport.ts'
import { vi as settingsAccount } from './settingsAccount.ts'
import { vi as settingsAgentLoop } from './settingsAgentLoop.ts'
import { vi as settingsGeneral } from './settingsGeneral.ts'
import { vi as settingsLocale } from './settingsLocale.ts'
import { vi as settingsModels } from './settingsModels.ts'
import { vi as settingsPluginInventory } from './settingsPluginInventory.ts'
import { vi as settingsPlugins } from './settingsPlugins.ts'
import { vi as settingsSessionLog } from './settingsSessionLog.ts'
import { vi as settingsShell } from './settingsShell.ts'
import { vi as settingsSubagent } from './settingsSubagent.ts'
import { vi as settingsWebSearch } from './settingsWebSearch.ts'
import { vi as shortcuts } from './shortcuts.ts'
import { vi as shortcutsLayout } from './shortcutsLayout.ts'
import { vi as sidebar } from './sidebar.ts'
import { vi as sidebarBrowser } from './sidebarBrowser.ts'
import { vi as sidebarCodePreview } from './sidebarCodePreview.ts'
import { vi as sidebarExcel } from './sidebarExcel.ts'
import { vi as sidebarFiles } from './sidebarFiles.ts'
import { vi as sidebarImage } from './sidebarImage.ts'
import { vi as sidebarOffice } from './sidebarOffice.ts'
import { vi as sidebarPdf } from './sidebarPdf.ts'
import { vi as sidebarRight } from './sidebarRight.ts'
import { vi as sidebarTerminal } from './sidebarTerminal.ts'
import { vi as skill } from './skill.ts'
import { vi as subagent } from './subagent.ts'
import { vi as taskManager } from './taskManager.ts'
import { vi as theme } from './theme.ts'
import { vi as trajectory } from './trajectory.ts'
import { vi as userQuestions } from './userQuestions.ts'
import { vi as voiceInput } from './voiceInput.ts'
import { vi as workflowRun } from './workflowRun.ts'
import { vi as workspace } from './workspace.ts'

/** Every registered client namespace and its Vietnamese dictionary. */
export const VI_DICTIONARIES = {
  'common': common,
  'settings.locale': settingsLocale,
  'settings.agentPreset': agentPreset,
  'agent-team': agentTeam,
  'approval': approval,
  'chat': chat,
  'claude-code-mods': claudeCodeMods,
  'command': commands,
  'conversation': conversation,
  'cordis': cordis,
  'cotTranslation': cotTranslation,
  'deliverables': deliverables,
  'directory-browser': directoryBrowser,
  'documentHtml': documentHtml,
  'documentMarkdown': documentMarkdown,
  'sidebarDocumentPreview': documentPreview,
  'goal': goal,
  'slash.menu': inputTrigger,
  'inspectorPanel': inspectorPanel,
  'job': jobs,
  'feedback': messageFeedback,
  'deepseek-model-label-1017': modelLabel1017,
  'model': modelSelection,
  'open-in-app': openInApp,
  'permission.access': permissionAccess,
  'settings.permission': permissionSettings,
  'plan': plan,
  'pluginManager': pluginManager,
  'pluginMarket': pluginMarket,
  'reference': reference,
  'schedule.catalog': scheduleCatalog,
  'secretMask': secretMask,
  'session-inspector': sessionInspector,
  'session-log-download': sessionLogExport,
  'settings.account': settingsAccount,
  'settings.agentLoop': settingsAgentLoop,
  'settings': settingsGeneral,
  'settings.models': settingsModels,
  'settings.pluginInventory': settingsPluginInventory,
  'settings.plugins': settingsPlugins,
  'settings.sessionLog': settingsSessionLog,
  'settings.shell': settingsShell,
  'settings.subagent': settingsSubagent,
  'settings.webSearch': settingsWebSearch,
  'shortcuts': shortcuts,
  'shortcuts.layout': shortcutsLayout,
  'sidebar': sidebar,
  'sidebarBrowser': sidebarBrowser,
  'sidebarCodePreview': sidebarCodePreview,
  'sidebarExcel': sidebarExcel,
  'sidebarFiles': sidebarFiles,
  'sidebarImage': sidebarImage,
  'sidebarOffice': sidebarOffice,
  'sidebarPdf': sidebarPdf,
  'sidebarRight': sidebarRight,
  'sidebarTerminal': sidebarTerminal,
  'skill': skill,
  'subagent': subagent,
  'schedule.manager': taskManager,
  'settings.theme': theme,
  'trajectory': trajectory,
  'question': userQuestions,
  'voice-input': voiceInput,
  'workflowRun': workflowRun,
  'workspace': workspace,
} satisfies Readonly<Record<string, LocaleDict>>
