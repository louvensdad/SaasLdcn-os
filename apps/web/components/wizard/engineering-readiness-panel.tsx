'use client';

import { AlertTriangle, Boxes, Gauge, UsersRound } from 'lucide-react';

import { ComplexityRadar, ReadinessRing } from '@/components/visual/engineering-surface';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type {
  DeliveryEstimate,
  EngineeringReadinessProfile,
  TeamRecommendation,
} from '@/lib/api/types';

function bandScore(band: string) {
  if (band === 'enterprise') return 92;
  if (band === 'high') return 78;
  if (band === 'medium') return 54;
  return 28;
}

function BurdenBar({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
        <span>{label}</span>
        <span className="font-semibold text-[color:var(--text)]">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--success),var(--accent),var(--warning))]"
          style={{ width: `${Math.max(10, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function EngineeringReadinessPanel({
  readiness,
  team,
  delivery,
  isLoading,
  errorMessage,
}: {
  readonly readiness: EngineeringReadinessProfile | null;
  readonly team: TeamRecommendation | null;
  readonly delivery: DeliveryEstimate | null;
  readonly isLoading?: boolean;
  readonly errorMessage?: string | null;
}) {
  if (errorMessage) {
    return (
      <Card className="grid gap-3 p-5" data-testid="engineering-readiness-panel">
        <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
          <AlertTriangle className="h-4 w-4 text-[color:var(--warning)]" />
          Engineering readiness offline
        </div>
        <p className="text-sm leading-6 text-[color:var(--muted)]">{errorMessage}</p>
      </Card>
    );
  }

  if (!readiness || isLoading) {
    return (
      <Card className="grid gap-3 p-5" data-testid="engineering-readiness-panel">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Engineering readiness</p>
        <p className="text-sm leading-6 text-[color:var(--muted)]">
          {isLoading ? 'Calculating team and production posture.' : 'Select a stack path to calculate team intelligence.'}
        </p>
      </Card>
    );
  }

  const effectiveTeam = team ?? readiness.team_recommendation;
  const effectiveDelivery = delivery ?? readiness.delivery_estimate;
  const burden = readiness.operational_burden;

  return (
    <div className="grid gap-4" data-testid="engineering-readiness-panel">
      <Card className="relative overflow-hidden p-5">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Team Intelligence Panel</p>
              <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">Engineering readiness</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{readiness.overall_readiness} readiness</Badge>
              <Badge>{effectiveTeam.team_size} people</Badge>
              <Badge>{readiness.required_seniority.replaceAll('_', ' ')}</Badge>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.7fr_1.3fr]">
            <ReadinessRing
              title="Production Readiness Surface"
              value={readiness.production_readiness.score}
              label={readiness.production_readiness.readiness.replaceAll('_', ' ')}
              caption="Production readiness recalculated from delivery, operations, and team maturity."
              tone={readiness.production_readiness.production_ready ? 'success' : readiness.production_readiness.score >= 45 ? 'warning' : 'danger'}
              className="bg-black/10"
            />
            <ComplexityRadar
              title="Delivery Complexity Radar"
              score={readiness.delivery_complexity.score}
              axes={[
                { label: 'Delivery', value: readiness.delivery_complexity.score },
                { label: 'Onboarding', value: bandScore(readiness.delivery_complexity.onboarding_effort) },
                { label: 'Deployment', value: bandScore(readiness.delivery_complexity.deployment_burden) },
                { label: 'Maintenance', value: bandScore(readiness.delivery_complexity.maintenance_effort) },
                { label: 'Learning', value: readiness.learning_curve.score },
              ]}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">Operational Burden Surface</p>
            <Badge>{burden.level}</Badge>
          </div>
          <BurdenBar label="Service ownership" value={burden.service_ownership} />
          <BurdenBar label="Deployment burden" value={burden.deployment_burden} />
          <BurdenBar label="Observability burden" value={burden.observability_burden} />
          <BurdenBar label="Incident burden" value={burden.incident_burden} />
          <div className="grid gap-2">
            {burden.signals.map((signal) => (
              <p key={signal} className="text-sm leading-6 text-[color:var(--muted)]">{signal}</p>
            ))}
          </div>
        </Card>

        <Card className="grid gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
              <UsersRound className="h-4 w-4 text-[color:var(--accent)]" />
              Team topology visualization
            </div>
            <Badge>{effectiveDelivery.estimated_weeks} weeks</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {effectiveTeam.roles.map((role) => (
              <div key={role.id} className="min-w-0 rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">{role.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{role.recommended_level.replaceAll('_', ' ')}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {effectiveTeam.required_expertise.map((skill) => (
              <Badge key={skill.id} className="border-white/10 bg-white/[0.04]">{skill.label}</Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
            <Boxes className="h-4 w-4 text-[color:var(--accent-2)]" />
            Engineering maturity rings
          </div>
          <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
            <Gauge className="h-4 w-4 text-[color:var(--success)]" />
            {readiness.learning_curve.ramp_up_weeks} week ramp-up
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['Deployment', readiness.deployment_readiness],
            ['Enterprise', readiness.enterprise_readiness],
            ['Team', readiness.production_readiness.team_readiness],
            ['Operations', readiness.production_readiness.operational_readiness],
          ].map(([label, score]) => (
            <div key={String(label)} className="grid place-items-center gap-2 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <div
                className="grid h-20 w-20 place-items-center rounded-full border border-white/10"
                style={{ background: `conic-gradient(var(--accent-2) 0 ${score}%, rgba(255,255,255,0.06) ${score}% 100%)` }}
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--surface)] text-sm font-semibold text-[color:var(--text)]">{score}</span>
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">{label}</p>
            </div>
          ))}
        </div>
        {readiness.engineering_risks.length ? (
          <div className="grid gap-2">
            {readiness.engineering_risks.map((risk) => (
              <p key={risk.id} className="text-sm leading-6 text-[color:var(--muted)]">
                <span className="font-semibold text-[color:var(--text)]">{risk.title}:</span> {risk.summary}
              </p>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
