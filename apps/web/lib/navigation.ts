import {
  BarChart3,
  ChartNoAxesCombined,
  BookOpen,
  BrainCircuit,
  GitBranch,
  Library,
  SearchCheck,
  LayoutDashboard,
  Compass,
  FlaskConical,
  Map,
  MessagesSquare,
  MonitorCog,
  Orbit,
  RefreshCw,
  Settings2,
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
    labelKey: 'navigation.platform.label',
    href: '/platform',
    icon: Orbit,
    descriptionKey: 'navigation.platform.description',
  },
  {
    labelKey: 'navigation.dashboard.label',
    href: '/dashboard',
    icon: LayoutDashboard,
    descriptionKey: 'navigation.dashboard.description',
  },
  {
    labelKey: 'navigation.analytics.label',
    href: '/analytics',
    icon: ChartNoAxesCombined,
    descriptionKey: 'navigation.analytics.description',
  },
  {
    labelKey: 'navigation.projects.label',
    href: '/projects',
    icon: BarChart3,
    descriptionKey: 'navigation.projects.description',
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
    labelKey: 'navigation.projectRooms.label',
    href: '/project-rooms',
    icon: MessagesSquare,
    descriptionKey: 'navigation.projectRooms.description',
  },
  {
    labelKey: 'navigation.architect.label',
    href: '/architect',
    icon: Compass,
    descriptionKey: 'navigation.architect.description',
  },
  {
    labelKey: 'navigation.engineeringReview.label',
    href: '/engineering-review',
    icon: SearchCheck,
    descriptionKey: 'navigation.engineeringReview.description',
  },
  {
    labelKey: 'navigation.engineeringLaboratory.label',
    href: '/engineering-laboratory',
    icon: FlaskConical,
    descriptionKey: 'navigation.engineeringLaboratory.description',
  },
  {
    labelKey: 'navigation.library.label',
    href: '/templates',
    icon: Library,
    descriptionKey: 'navigation.library.description',
  },
  {
    labelKey: 'navigation.modernize.label',
    href: '/modernize',
    icon: RefreshCw,
    descriptionKey: 'navigation.modernize.description',
  },
  {
    labelKey: 'navigation.autoFix.label',
    href: '/auto-fix',
    icon: WandSparkles,
    descriptionKey: 'navigation.autoFix.description',
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
