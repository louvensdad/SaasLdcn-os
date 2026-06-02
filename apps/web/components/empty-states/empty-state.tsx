import { Archive, BookOpen, Download, FolderKanban, LayoutTemplate } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Card } from '@/components/ui/card';

type EmptyStateKind = 'projects' | 'templates' | 'downloads' | 'documentation';

const copy: Record<EmptyStateKind, { title: string; description: string; action: string; href: string; icon: typeof Archive }> = {
  projects: {
    title: 'No projects yet',
    description: 'Project registry is ready for future generated projects and downloads.',
    action: 'Open wizard',
    href: '/wizard',
    icon: FolderKanban,
  },
  templates: {
    title: 'No templates selected',
    description: 'Templates will later provide real blueprints, previews, and default answers.',
    action: 'Explore templates',
    href: '/templates',
    icon: LayoutTemplate,
  },
  downloads: {
    title: 'No downloads yet',
    description: 'Secure downloads will appear after generation and project registry phases.',
    action: 'Review roadmap',
    href: '/documentation',
    icon: Download,
  },
  documentation: {
    title: 'Documentation surface ready',
    description: 'Docs are structured for architecture, standards, prompts, agents, and roadmap.',
    action: 'Open docs',
    href: '/documentation',
    icon: BookOpen,
  },
};

export function EmptyState({ kind }: { readonly kind: EmptyStateKind }) {
  const state = copy[kind];
  const Icon = state.icon;

  return (
    <Card className="cinematic-surface overflow-hidden text-center">
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-20" />
      <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-white/5">
        <Icon className="h-6 w-6 text-[color:var(--accent)]" />
      </div>
      <h3 className="relative mt-4 text-lg font-semibold text-[color:var(--text)]">{state.title}</h3>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-[color:var(--muted)]">{state.description}</p>
      <div className="relative mt-5">
        <ActionLink href={state.href} variant="soft">
          {state.action}
        </ActionLink>
      </div>
    </Card>
  );
}
