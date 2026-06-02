import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  GitBranch,
  LayoutDashboard,
  Map,
  MonitorCog,
  Settings2,
  SquareStack,
  WandSparkles,
} from 'lucide-react';

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly icon: typeof LayoutDashboard;
  readonly description: string;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Operational overview and system pulse.',
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: BarChart3,
    description: 'Project registry and delivery state.',
  },
  {
    label: 'Templates',
    href: '/templates',
    icon: SquareStack,
    description: 'Blueprint-driven starting points.',
  },
  {
    label: 'Skills',
    href: '/skills',
    icon: BrainCircuit,
    description: 'Operational skills registry.',
  },
  {
    label: 'Wizard',
    href: '/wizard',
    icon: WandSparkles,
    description: 'Stack-specific setup journeys.',
  },
  {
    label: 'System Status',
    href: '/system-status',
    icon: MonitorCog,
    description: 'Internal platform health.',
  },
  {
    label: 'Architecture',
    href: '/architecture',
    icon: GitBranch,
    description: 'Runtime and module map.',
  },
  {
    label: 'Roadmap',
    href: '/roadmap',
    icon: Map,
    description: 'Governed platform plan.',
  },
  {
    label: 'Documentation',
    href: '/documentation',
    icon: BookOpen,
    description: 'Platform memory and standards.',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings2,
    description: 'Theme and runtime preferences.',
  },
] as const;
