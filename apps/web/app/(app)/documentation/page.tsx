'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/shell/section-header';
import {
  ArchitectureGraphSurface,
  DeploymentPathSurface,
  OperationalRail,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';

const lifecycle = [
  'Blueprint formation',
  'Prompt Master synthesis',
  'Gatekeeper review',
  'Project registry persistence',
  'Generation readiness',
  'Future download phase',
] as const;

const knowledgeBlocks = [
  {
    title: 'Architecture maps',
    description: 'Visual topology of language, runtime, framework, architecture, and archetype relationships.',
  },
  {
    title: 'Lifecycle surfaces',
    description: 'Blueprint, Prompt Master, and Gatekeeper stages remain explicit throughout the journey.',
  },
  {
    title: 'Quality gates',
    description: 'Validation, blockers, warnings, and readiness states are always shown without hidden shortcuts.',
  },
  {
    title: 'Operational standards',
    description: 'Runtime health, registry rules, and backend contract boundaries are treated as first-class knowledge.',
  },
  {
    title: 'Dependency maps',
    description: 'Selected capabilities, modules, and endpoints remain connected to the system contract lineage.',
  },
  {
    title: 'Engineering phases',
    description: 'The platform maintains a clear sequence from architecture design to future generation control.',
  },
] as const;

export default function DocumentationPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        title="Documentation"
        description="Architecture knowledge system for lifecycle surfaces, gates, dependency maps, and operational standards."
      />

      <div className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
        <ArchitectureGraphSurface
          title="Architecture knowledge map"
          subtitle="Documentation now behaves like a navigable system diagram: each surface describes how blueprint, validation, and registry knowledge fit together."
          nodes={[
            {
              label: 'Blueprint',
              value: 'Lifecycle input',
              detail: 'Selection, validation, and snapshots',
              tone: 'accent',
            },
            {
              label: 'Prompt Master',
              value: 'Technical contract',
              detail: 'Structured document with redacted trace data',
              tone: 'accent2',
            },
            {
              label: 'Gatekeeper',
              value: 'Governance layer',
              detail: 'Approved / warnings / blocked decisioning',
              tone: 'success',
            },
            {
              label: 'Registry',
              value: 'Persistent record',
              detail: 'Project snapshots stored in backend',
              tone: 'muted',
            },
          ]}
        />

        <DeploymentPathSurface
          title="Lifecycle surface"
          steps={lifecycle.map((label, index) => ({
            label,
            detail:
              index === 0
                ? 'Define the engineering intent and stack topology.'
                : index === 1
                  ? 'Transform the blueprint into a safe technical contract.'
                  : index === 2
                    ? 'Run governed review before any future generation phase.'
                    : index === 3
                      ? 'Persist the validated record as a Project Registry entry.'
                      : index === 4
                        ? 'Mark the project as ready, blocked, or generated.'
                        : 'Future phase remains intentionally disabled in this sprint.',
            tone:
              index === 2
                ? 'warning'
                : index === 4
                  ? 'success'
                  : index === 5
                    ? 'accent2'
                    : 'accent',
          }))}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 md:grid-cols-2">
          {knowledgeBlocks.map((block) => (
            <Card key={block.title} className="space-y-4 p-5">
              <Badge>{block.title}</Badge>
              <p className="text-sm leading-6 text-[color:var(--muted)]">{block.description}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4">
          <OperationalRail
            title="Quality gate visualization"
            items={[
              {
                label: 'Validation',
                value: 'Explicit',
                detail: 'Blueprint and Prompt Master validation are surfaced',
                tone: 'success',
              },
              {
                label: 'Lineage',
                value: 'Persisted',
                detail: 'Snapshots are attached to project records',
                tone: 'accent',
              },
              {
                label: 'Dependencies',
                value: 'Mapped',
                detail: 'Modules and endpoints stay connected to architecture',
                tone: 'accent2',
              },
              {
                label: 'Generation',
                value: 'Disabled',
                detail: 'This sprint is visual and operational only',
                tone: 'warning',
              },
            ]}
          />

          <StackEcosystemMap
            title="Dependency map"
            nodes={[
              {
                label: 'Capabilities',
                value: 'Selected',
                detail: 'Capability choice narrows the architecture surface',
                tone: 'accent',
              },
              {
                label: 'Modules',
                value: 'Owned',
                detail: 'Business modules drive the system shape',
                tone: 'accent2',
              },
              {
                label: 'Endpoints',
                value: 'Grouped',
                detail: 'Route groups remain visible and governable',
                tone: 'success',
              },
              {
                label: 'Standards',
                value: 'Codified',
                detail: 'The operating rules remain easy to audit',
                tone: 'muted',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
