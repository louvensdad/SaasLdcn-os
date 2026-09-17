import type { MessageKey } from '@/lib/i18n/messages';
import { destinationFor } from '@/lib/routes';

/** What the “Learn about this screen” panel says for a path of this app. */
export interface ScreenHelp {
  readonly name: MessageKey;
  readonly question: MessageKey;
  readonly action: MessageKey;
  readonly guide: string | null;
}

export function screenHelp(pathname: string): ScreenHelp {
  if (pathname === '/') return { name: 'nav.command', question: 'screen.command.question', action: 'screen.command.action', guide: 'how-it-works' };
  if (pathname === '/inbox') return { name: 'nav.inbox', question: 'screen.inbox.question', action: 'screen.inbox.action', guide: 'decisions' };
  if (pathname === '/inbox/activity') return { name: 'nav.activity', question: 'screen.activity.question', action: 'screen.activity.action', guide: 'decisions' };
  if (pathname === '/projects') return { name: 'nav.projects', question: 'screen.projects.question', action: 'screen.projects.action', guide: 'projects' };
  if (/^\/p\/[^/]+$/.test(pathname)) return { name: 'nav.cockpit', question: 'screen.project.question', action: 'screen.project.action', guide: 'projects' };
  if (/^\/p\/[^/]+\/missions$/.test(pathname)) return { name: 'nav.missions', question: 'screen.missions.question', action: 'screen.missions.action', guide: 'missions' };
  if (/^\/p\/[^/]+\/missions\/[^/]+$/.test(pathname)) return { name: 'nav.missions', question: 'screen.mission.question', action: 'screen.mission.action', guide: 'missions' };
  if (/^\/p\/[^/]+\/evidence$/.test(pathname)) return { name: 'nav.evidence', question: 'screen.evidence.question', action: 'screen.evidence.action', guide: 'evidence' };
  if (/^\/p\/[^/]+\/evidence\/test-room$/.test(pathname)) return { name: 'testroom.title', question: 'screen.testRoom.question', action: 'screen.testRoom.action', guide: 'verification' };
  if (/^\/p\/[^/]+\/delivery$/.test(pathname)) return { name: 'nav.delivery', question: 'screen.delivery.question', action: 'screen.delivery.action', guide: 'delivery' };
  if (/^\/p\/[^/]+\/missions\/[^/]+\/company$/.test(pathname)) return { name: 'company.eyebrow', question: 'screen.company.question', action: 'screen.company.action', guide: 'certification' };
  if (/^\/p\/[^/]+\/missions\/[^/]+\/company\/agents\/[^/]+$/.test(pathname)) return { name: 'agent.eyebrow', question: 'screen.agent.question', action: 'screen.agent.action', guide: 'certification' };
  if (/^\/p\/[^/]+\/missions\/[^/]+\/jobs\/[^/]+$/.test(pathname)) return { name: 'companyJob.eyebrow', question: 'screen.companyJob.question', action: 'screen.companyJob.action', guide: 'certification' };
  if (pathname === '/workforce') return { name: 'nav.workforce', question: 'screen.workforce.question', action: 'screen.workforce.action', guide: 'certification' };
  if (pathname === '/workforce/planner') return { name: 'workforce.planner', question: 'screen.planner.question', action: 'screen.planner.action', guide: 'certification' };
  if (pathname === '/library') return { name: 'nav.library', question: 'screen.library.question', action: 'screen.library.action', guide: 'templates' };
  if (pathname === '/new') return { name: 'nav.start', question: 'screen.start.question', action: 'screen.start.action', guide: 'how-it-works' };
  if (/^\/missions\/[^/]+$/.test(pathname)) return { name: 'nav.missions', question: 'screen.guided.question', action: 'screen.guided.action', guide: 'guided' };
  if (pathname === '/studio') return { name: 'nav.studio', question: 'screen.studio.question', action: 'screen.studio.action', guide: 'data' };
  if (pathname === '/studio/data') return { name: 'nav.data', question: 'screen.data.question', action: 'screen.data.action', guide: 'data' };
  if (/^\/studio\/data\/[^/]+$/.test(pathname)) return { name: 'nav.data', question: 'screen.dataSession.question', action: 'screen.dataSession.action', guide: 'data' };
  if (pathname === '/studio/automations') return { name: 'nav.automations', question: 'screen.automations.question', action: 'screen.automations.action', guide: 'automations' };
  if (pathname === '/library/technology') return { name: 'nav.technology', question: 'screen.technology.question', action: 'screen.technology.action', guide: 'how-it-works' };
  if (pathname === '/library/templates') return { name: 'nav.templates', question: 'screen.templates.question', action: 'screen.templates.action', guide: 'templates' };
  if (pathname === '/library/knowledge') return { name: 'nav.knowledge', question: 'screen.knowledge.question', action: 'screen.knowledge.action', guide: 'memory' };
  if (pathname === '/library/marketplace') return { name: 'nav.marketplace', question: 'screen.marketplace.question', action: 'screen.marketplace.action', guide: 'automations' };
  if (pathname === '/library/research') return { name: 'nav.research', question: 'screen.research.question', action: 'screen.research.action', guide: 'evidence' };
  if (pathname === '/library/certification') return { name: 'library.section.certification', question: 'screen.certification.question', action: 'screen.certification.action', guide: 'certification' };
  if (/^\/p\/[^/]+\/engineering$/.test(pathname)) return { name: 'nav.engineering', question: 'screen.engineering.question', action: 'screen.engineering.action', guide: 'changes' };
  if (/^\/p\/[^/]+\/engineering\/changes$/.test(pathname)) return { name: 'nav.changes', question: 'screen.changes.question', action: 'screen.changes.action', guide: 'changes' };
  if (/^\/p\/[^/]+\/engineering\/changes\/[^/]+$/.test(pathname)) return { name: 'nav.changes', question: 'screen.change.question', action: 'screen.change.action', guide: 'changes' };
  if (/^\/p\/[^/]+\/engineering\/verification$/.test(pathname)) return { name: 'nav.verification', question: 'screen.verification.question', action: 'screen.verification.action', guide: 'verification' };
  if (/^\/p\/[^/]+\/runtime$/.test(pathname)) return { name: 'nav.runtime', question: 'screen.runtime.question', action: 'screen.runtime.action', guide: 'runtime' };
  if (/^\/p\/[^/]+\/modernize$/.test(pathname)) return { name: 'nav.modernize', question: 'screen.modernize.question', action: 'screen.modernize.action', guide: 'modernize' };
  if (/^\/p\/[^/]+\/define\/discovery$/.test(pathname)) return { name: 'nav.discovery', question: 'screen.discovery.question', action: 'screen.discovery.action', guide: 'discovery' };
  if (/^\/p\/[^/]+\/define\/requirements$/.test(pathname)) return { name: 'nav.requirements', question: 'screen.requirements.question', action: 'screen.requirements.action', guide: 'discovery' };
  if (/^\/p\/[^/]+\/define\/architecture$/.test(pathname)) return { name: 'nav.architecture', question: 'screen.architecture.question', action: 'screen.architecture.action', guide: 'architecture' };
  if (/^\/p\/[^/]+\/define\/review$/.test(pathname)) return { name: 'nav.review', question: 'screen.review.question', action: 'screen.review.action', guide: 'review' };
  if (/^\/p\/[^/]+\/memory$/.test(pathname)) return { name: 'nav.memory', question: 'screen.memory.question', action: 'screen.memory.action', guide: 'memory' };
  if (/^\/p\/[^/]+\/governance$/.test(pathname)) return { name: 'nav.governance', question: 'screen.governance.question', action: 'screen.governance.action', guide: 'decisions' };
  if (pathname === '/settings') return { name: 'nav.settings', question: 'screen.settings.question', action: 'screen.settings.action', guide: 'account' };
  if (pathname === '/settings/ai') return { name: 'settings.section.ai', question: 'screen.settingsAi.question', action: 'screen.settingsAi.action', guide: 'ai-key' };
  if (pathname === '/settings/plan') return { name: 'settings.section.plan', question: 'screen.settingsPlan.question', action: 'screen.settingsPlan.action', guide: 'plan' };
  if (pathname === '/settings/account') return { name: 'settings.section.account', question: 'screen.settingsAccount.question', action: 'screen.settingsAccount.action', guide: 'account' };
  if (pathname === '/settings/workspace') return { name: 'settings.section.workspace', question: 'screen.settingsWorkspace.question', action: 'screen.settingsWorkspace.action', guide: 'account' };
  if (pathname === '/settings/preferences') return { name: 'settings.section.preferences', question: 'screen.settingsPreferences.question', action: 'screen.settingsPreferences.action', guide: 'account' };
  if (pathname === '/settings/integrations') return { name: 'settings.section.integrations', question: 'screen.settingsIntegrations.question', action: 'screen.settingsIntegrations.action', guide: 'delivery' };
  if (pathname === '/platform') return { name: 'nav.platform', question: 'screen.platform.question', action: 'screen.platform.action', guide: 'platform' };
  if (pathname === '/platform/decisions') return { name: 'platform.decisions', question: 'screen.traces.question', action: 'screen.traces.action', guide: 'platform' };
  if (pathname === '/platform/config') return { name: 'config.title', question: 'screen.config.question', action: 'screen.config.action', guide: 'platform' };
  if (pathname === '/platform/roadmap') return { name: 'platform.roadmap', question: 'screen.roadmap.question', action: 'screen.roadmap.action', guide: 'platform' };
  if (pathname === '/learn') return { name: 'nav.learn', question: 'screen.learn.question', action: 'screen.learn.action', guide: 'how-it-works' };
  if (pathname === '/learn/terms') return { name: 'nav.learnTerms', question: 'screen.terms.question', action: 'screen.terms.action', guide: 'signals' };
  if (pathname.startsWith('/learn/')) return { name: 'nav.learn', question: 'screen.guide.question', action: 'screen.guide.action', guide: 'signals' };
  const destination = destinationFor(pathname);
  return {
    name: destination?.label ?? 'pending.unknownTitle',
    question: 'screen.pending.question',
    action: 'screen.pending.action',
    guide: destination?.guide ?? null,
  };
}
