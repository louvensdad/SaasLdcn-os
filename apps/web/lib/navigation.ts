import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  Factory,
  GitBranch,
  LayoutDashboard,
  Map,
  MonitorCog,
  RefreshCw,
  Settings2,
  SquareStack,
  WandSparkles,
} from 'lucide-react';

export interface NavigationItem {
  readonly labelKey: string;
  readonly href: string;
  readonly icon: typeof LayoutDashboard;
  readonly descriptionKey: string;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    labelKey: 'navigation.dashboard.label',
    href: '/dashboard',
    icon: LayoutDashboard,
    descriptionKey: 'navigation.dashboard.description',
  },
  {
    labelKey: 'navigation.projects.label',
    href: '/projects',
    icon: BarChart3,
    descriptionKey: 'navigation.projects.description',
  },
  {
    labelKey: 'navigation.templates.label',
    href: '/templates',
    icon: SquareStack,
    descriptionKey: 'navigation.templates.description',
  },
  {
    labelKey: 'navigation.skills.label',
    href: '/skills',
    icon: BrainCircuit,
    descriptionKey: 'navigation.skills.description',
  },
  {
    labelKey: 'navigation.wizard.label',
    href: '/wizard',
    icon: WandSparkles,
    descriptionKey: 'navigation.wizard.description',
  },
  {
    labelKey: 'navigation.metaFactory.label',
    href: '/meta-factory',
    icon: Factory,
    descriptionKey: 'navigation.metaFactory.description',
  },
  {
    labelKey: 'navigation.modernize.label',
    href: '/modernize',
    icon: RefreshCw,
    descriptionKey: 'navigation.modernize.description',
  },
  {
    labelKey: 'navigation.systemStatus.label',
    href: '/system-status',
    icon: MonitorCog,
    descriptionKey: 'navigation.systemStatus.description',
  },
  {
    labelKey: 'navigation.architecture.label',
    href: '/architecture',
    icon: GitBranch,
    descriptionKey: 'navigation.architecture.description',
  },
  {
    labelKey: 'navigation.roadmap.label',
    href: '/roadmap',
    icon: Map,
    descriptionKey: 'navigation.roadmap.description',
  },
  {
    labelKey: 'navigation.documentation.label',
    href: '/documentation',
    icon: BookOpen,
    descriptionKey: 'navigation.documentation.description',
  },
  {
    labelKey: 'navigation.settings.label',
    href: '/settings',
    icon: Settings2,
    descriptionKey: 'navigation.settings.description',
  },
] as const;
