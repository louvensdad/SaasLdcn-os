import type { ThemeId } from '@/lib/themes';

export type SearchItemKind = 'page' | 'theme' | 'documentation' | 'action' | 'registry' | 'specialist';

export interface SearchItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: SearchItemKind;
  readonly keywords: readonly string[];
  readonly href?: string;
  readonly themeId?: ThemeId;
  readonly actionId?: 'open-notifications' | 'open-settings' | 'open-example-modal' | 'open-example-drawer';
}

export const SEARCH_ITEMS: readonly SearchItem[] = [
  {
    id: 'page-dashboard',
    title: 'Dashboard',
    description: 'Open the operational overview.',
    kind: 'page',
    href: '/dashboard',
    keywords: ['home', 'overview', 'cockpit', 'metrics'],
  },
  {
    id: 'page-projects',
    title: 'Projects',
    description: 'Open the project registry.',
    kind: 'page',
    href: '/projects',
    keywords: ['registry', 'project', 'delivery'],
  },
  {
    id: 'page-analytics',
    title: 'Analytics Center',
    description: 'Open operational intelligence and platform telemetry.',
    kind: 'page',
    href: '/analytics',
    keywords: ['analytics', 'data intelligence', 'telemetry', 'quality', 'llm', 'agents'],
  },
  {
    id: 'page-templates',
    title: 'Templates',
    description: 'Open template previews.',
    kind: 'page',
    href: '/templates',
    keywords: ['blueprint', 'template', 'preview'],
  },
  {
    id: 'page-wizard',
    title: 'Wizard',
    description: 'Open the stack setup flow.',
    kind: 'page',
    href: '/wizard',
    keywords: ['setup', 'flow', 'stack'],
  },
  {
    id: 'page-engineering-laboratory',
    title: 'Engineering Laboratory',
    description: 'Open real project analysis, terminal, security, quality, API and DevOps modules.',
    kind: 'page',
    href: '/engineering-laboratory',
    keywords: ['lab', 'terminal', 'security', 'quality', 'api', 'tests', 'deploy'],
  },
  {
    id: 'page-documentation',
    title: 'Documentation',
    description: 'Open platform documentation.',
    kind: 'documentation',
    href: '/documentation',
    keywords: ['docs', 'architecture', 'quality', 'standards'],
  },
  {
    id: 'page-settings',
    title: 'Settings',
    description: 'Open runtime preferences.',
    kind: 'page',
    href: '/settings',
    keywords: ['preferences', 'theme', 'configuration'],
  },
  {
    id: 'theme-dark',
    title: 'Dark',
    description: 'Switch to the dark theme.',
    kind: 'theme',
    themeId: 'dark',
    keywords: ['theme', 'dark', 'escuro'],
  },
  {
    id: 'theme-light',
    title: 'Light',
    description: 'Switch to the light theme.',
    kind: 'theme',
    themeId: 'light',
    keywords: ['theme', 'light', 'claro'],
  },
  {
    id: 'action-open-notifications',
    title: 'Open Notification Center',
    description: 'Open foundation-only notification center.',
    kind: 'action',
    actionId: 'open-notifications',
    keywords: ['notification', 'bell', 'center', 'updates'],
  },
  {
    id: 'action-open-settings',
    title: 'Open Settings',
    description: 'Navigate to settings and theme controls.',
    kind: 'action',
    actionId: 'open-settings',
    href: '/settings',
    keywords: ['settings', 'preferences', 'theme'],
  },
  {
    id: 'action-example-modal',
    title: 'Open Example Modal',
    description: 'Preview accessible modal foundation.',
    kind: 'action',
    actionId: 'open-example-modal',
    keywords: ['modal', 'confirmation', 'dialog', 'overlay'],
  },
  {
    id: 'action-example-drawer',
    title: 'Open Example Drawer',
    description: 'Preview right drawer foundation.',
    kind: 'action',
    actionId: 'open-example-drawer',
    keywords: ['drawer', 'details', 'panel', 'overlay'],
  },
] as const;

export function createTechnologySearchItems(
  items: readonly {
    id: string;
    name: string;
    description: string;
    category?: string;
    keywords?: readonly string[];
    prefix: string;
  }[],
): readonly SearchItem[] {
  return items.map((item) => ({
    id: `${item.prefix}-${item.id}`,
    title: item.name,
    description: item.category ? `${item.description} (${item.category})` : item.description,
    kind: 'registry',
    href: '/wizard',
    keywords: [item.prefix, item.id, item.name.toLowerCase(), ...(item.category ? [item.category] : []), ...(item.keywords ?? [])],
  }));
}

export function createArchetypeSearchItems(
  archetypes: readonly {
    id: string;
    name: string;
    description: string;
    category: string;
  }[],
): readonly SearchItem[] {
  return createTechnologySearchItems(
    archetypes.map((archetype) => ({ ...archetype, prefix: 'archetype' })),
  );
}

export function createCapabilitySearchItems(
  capabilities: readonly {
    id: string;
    name: string;
    description: string;
    category: string;
  }[],
): readonly SearchItem[] {
  return createTechnologySearchItems(
    capabilities.map((capability) => ({ ...capability, prefix: 'capability' })),
  );
}

export function createFrameworkSpecialistSearchItems(
  frameworks: readonly {
    id: string;
    name: string;
    description: string;
    framework_type: string;
    language_id: string;
    runtime_id: string;
  }[],
): readonly SearchItem[] {
  return frameworks.map((framework) => ({
    id: `framework-specialist-${framework.id}`,
    title: `${framework.name} specialist profile`,
    description: `Architecture guidance, tradeoffs and readiness for ${framework.name}.`,
    kind: 'specialist',
    href: '/wizard',
    keywords: [
      'specialist',
      'framework specialist',
      framework.id,
      framework.name.toLowerCase(),
      framework.description,
      framework.framework_type,
      framework.language_id,
      framework.runtime_id,
      'readiness',
      'architecture guidance',
      'capabilities',
    ],
  }));
}

export function filterSearchItems(
  query: string,
  items: readonly SearchItem[] = SEARCH_ITEMS,
): readonly SearchItem[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.description,
      item.kind,
      ...item.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalized);
  });
}
