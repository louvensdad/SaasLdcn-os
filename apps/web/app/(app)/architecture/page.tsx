'use client';

import { useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/shell/section-header';
import {
  ArchitectureGraphSurface,
  DeploymentPathSurface,
  OperationalRail,
  StackEcosystemMap,
} from '@/components/visual/engineering-surface';
import { useLDCNStore } from '@/stores/use-ldcn-store';

const activeRuntimeMap = [
  'apps/api FastAPI backend',
  'apps/web Next.js frontend',
  'packages/contracts shared contracts',
  'templates local generated bases',
  'reports governance memory',
] as const;

const futureModules = ['future/agents', 'future/engines', 'future/services', 'future/voice'] as const;
const engines = ['blueprint', 'gatekeeper', 'template_registry', 'skill_registry', 'system_status', 'roadmap'] as const;
const registries = ['technology registry', 'template registry', 'skill registry', 'project registry'] as const;

export default function ArchitecturePage() {
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: '/architecture',
      page_title: 'Architecture Center',
      current_phase: 'Platform architecture',
      pipeline: {
        route: '/architecture',
        phase: 'Platform architecture',
        status: 'ready',
        readiness_label: 'Active runtime map documented',
        detail: 'Current architecture is visible without generation or deployment.',
      },
      status: 'observing',
      summary: 'Active runtime, future modules, engines and registries are separated for governance.',
      suggestions: [],
    });
  }, [setContext, setPresenceState]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Architecture"
        description="Current LDCN OS platform architecture, separating active runtime, future modules, engines and registries."
      />

      <ArchitectureGraphSurface
        title="Architectural Graph"
        subtitle="High-level local platform topology. This view reads current organization and reports; it does not generate code."
        hint="Architecture Center"
        nodes={[
          { label: 'Contracts', value: 'packages', detail: 'Shared platform contracts', tone: 'accent' },
          { label: 'API', value: 'apps/api', detail: 'FastAPI route and engine layer', tone: 'success' },
          { label: 'Web', value: 'apps/web', detail: 'Next.js governance UI', tone: 'accent2' },
          { label: 'Reports', value: 'reports', detail: 'Audit and validation memory', tone: 'muted' },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <StackEcosystemMap
          title="Active Runtime Map"
          nodes={activeRuntimeMap.map((item, index) => ({
            label: `Runtime ${index + 1}`,
            value: item,
            detail: 'Active build/runtime/test surface',
            tone: index === 0 ? 'success' : index === 1 ? 'accent' : 'muted',
          }))}
        />

        <DeploymentPathSurface
          title="Future Modules Map"
          steps={futureModules.map((item) => ({
            label: item,
            detail: 'Reserved for future phases, not active runtime.',
            tone: 'muted',
          }))}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <OperationalRail
          title="Engine Overview"
          items={engines.map((engine) => ({
            label: engine,
            value: 'active',
            detail: 'Deterministic backend engine or registry foundation.',
            tone: 'success',
          }))}
        />

        <OperationalRail
          title="Registry Overview"
          items={registries.map((registry) => ({
            label: registry,
            value: 'indexed',
            detail: 'Local platform registry; no external marketplace integration.',
            tone: 'accent',
          }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Dependency Overview', 'Dependency graph, architectural graph and engineering readiness surfaces are active.'],
          ['Infrastructure Overview', 'Infrastructure recommendations and topology are local deterministic previews.'],
          ['Report Sources', 'active_runtime_map, future_modules_map, template reports and skill audit inform this center.'],
        ].map(([title, detail]) => (
          <Card key={title} className="space-y-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{title}</p>
            <p className="text-sm leading-6 text-[color:var(--muted)]">{detail}</p>
            <Badge>governed</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
