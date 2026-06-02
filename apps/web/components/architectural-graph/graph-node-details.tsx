'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { ArchitecturalNode } from '@/lib/api/types';

export function GraphNodeDetails({ node }: { readonly node: ArchitecturalNode | null }) {
  return (
    <Card className="grid gap-3 p-4" data-testid="graph-node-details">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Node Details</p>
      {!node ? (
        <p className="text-sm text-[color:var(--muted)]">Select a node to inspect burden, ownership, risk and readiness.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-semibold text-[color:var(--text)]">{node.label}</p>
            <Badge>{node.type}</Badge>
          </div>
          <div className="grid gap-2 text-sm text-[color:var(--muted)] sm:grid-cols-2">
            <p>Readiness <span className="font-semibold text-[color:var(--text)]">{node.readiness_score}</span></p>
            <p>Ownership <span className="font-semibold text-[color:var(--text)]">{node.ownership_role}</span></p>
            <p>Risk <span className="font-semibold text-[color:var(--text)]">{node.risk_level}</span></p>
            <p>Burden <span className="font-semibold text-[color:var(--text)]">{node.burden_score}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {node.required_skills.map((skill) => (
              <Badge key={skill} className="border-white/10 bg-black/15">{skill}</Badge>
            ))}
          </div>
          {node.warnings.map((warning) => (
            <p key={warning} className="text-sm leading-5 text-[color:var(--warning)]">{warning}</p>
          ))}
          {node.recommendations.map((recommendation) => (
            <p key={recommendation} className="text-sm leading-5 text-[color:var(--muted)]">{recommendation}</p>
          ))}
        </>
      )}
    </Card>
  );
}
