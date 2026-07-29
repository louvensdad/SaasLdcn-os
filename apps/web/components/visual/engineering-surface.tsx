'use client';

import { motion, useReducedMotion } from 'framer-motion';
import {
  Cpu,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { AnimatedCounter } from '@/components/motion/animated-counter';
import { DonutChart } from '@/components/visual/donut-chart';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

type Tone = 'accent' | 'accent2' | 'success' | 'warning' | 'danger' | 'muted';

const toneClasses: Record<Tone, string> = {
  accent: 'border-[color-mix(in_srgb,var(--accent)_28%,transparent)] text-[color:var(--text)]',
  accent2: 'border-[color-mix(in_srgb,var(--accent-2)_26%,transparent)] text-[color:var(--text)]',
  success: 'border-[color-mix(in_srgb,var(--success)_24%,transparent)] text-[color:var(--success)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_24%,transparent)] text-[color:var(--warning)]',
  danger: 'border-[color-mix(in_srgb,var(--danger)_24%,transparent)] text-[color:var(--danger)]',
  muted: 'border-white/10 text-[color:var(--muted)]',
};

export interface GraphNode {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly tone?: Tone;
}

export function ArchitectureGraphSurface({
  title,
  subtitle,
  nodes,
  hint,
  className,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly nodes: readonly GraphNode[];
  readonly hint?: string;
  readonly className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const { t } = useLocale();

  return (
    <Card className={cn('cinematic-surface relative overflow-hidden p-0', className)}>
      <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_28%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent-2)_10%,transparent),transparent_26%)]" />
      <div className="relative grid gap-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="ds-caption text-[color:var(--muted)]">
              {hint ?? t('engineering.graphEngine')}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[color:var(--text)]">{title}</h3>
            {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{subtitle}</p> : null}
          </div>
          <Badge className="shrink-0 border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-white/5">
            {t('engineering.liveTopology')}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {nodes.map((node, index) => (
            <motion.div
              key={`${node.label}-${node.value}`}
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.35 }}
              className={cn(
                'relative min-w-0 rounded-[var(--radius-xl)] border bg-black/15 p-4 shadow-[var(--shadow-soft)]',
                toneClasses[node.tone ?? 'muted'],
              )}
            >
              <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
              <div className="flex items-center justify-between gap-3">
                <p className="ds-caption text-[color:var(--muted)]">
                  {node.label}
                </p>
                <div className="h-2 w-2 rounded-full bg-[color:var(--accent)] shadow-[0_0_16px_var(--glow)]" />
              </div>
              <p className="mt-4 text-lg font-semibold text-[color:var(--text)]">{node.value}</p>
              {node.detail ? <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{node.detail}</p> : null}
            </motion.div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function ReadinessRing({
  title,
  value,
  label,
  caption,
  tone = 'accent',
  className,
}: {
  readonly title: string;
  readonly value: number;
  readonly label: string;
  readonly caption?: string;
  readonly tone?: Tone;
  readonly className?: string;
}) {
  const { t } = useLocale();
  const clamped = Math.max(0, Math.min(100, value));
  const accentVar = tone === 'warning' ? 'var(--warning)' : tone === 'danger' ? 'var(--danger)' : tone === 'success' ? 'var(--success)' : 'var(--accent)';

  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_35%)]" />
      <div className="relative grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ds-subsection text-[color:var(--text)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{caption ?? t('engineering.readinessSurface')}</p>
          </div>
          <Badge className={toneClasses[tone]}>{label}</Badge>
        </div>

        <DonutChart value={clamped} size={160} stroke={14} color={accentVar} className="mx-auto">
          <div className="text-center">
            <AnimatedCounter value={clamped} className="text-3xl font-semibold text-[color:var(--text)]" />
            <p className="mt-0.5 t-overline">{t('engineering.percent')}</p>
          </div>
        </DonutChart>
      </div>
    </Card>
  );
}

export function ComplexityRadar({
  title,
  score,
  axes,
  className,
}: {
  readonly title: string;
  readonly score: number;
  readonly axes: readonly { label: string; value: number }[];
  readonly className?: string;
}) {
  const { t } = useLocale();
  const size = 240;
  const center = size / 2;
  const radius = 82;
  const max = 100;
  const normalizedAxes = axes.length ? axes : [{ label: t('engineering.operations'), value: score }];
  const points = normalizedAxes.map((axis, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / normalizedAxes.length;
    const distance = radius * Math.max(0.26, Math.min(1, axis.value / max));
    return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`;
  });
  const shouldReduceMotion = useReducedMotion();

  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent-2)_10%,transparent),transparent_42%)]" />
      <div className="relative grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="ds-subsection text-[color:var(--text)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('engineering.complexityDetail')}</p>
          </div>
          <Badge className="border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-white/5">{t('engineering.score', { score })}</Badge>
        </div>

        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-center">
          <div className="mx-auto grid h-56 w-56 place-items-center">
            <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
              {[0.28, 0.48, 0.68, 0.88].map((ring) => (
                <circle
                  key={ring}
                  cx={center}
                  cy={center}
                  r={radius * ring}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
              ))}
              {normalizedAxes.map((axis, index) => {
                const angle = -Math.PI / 2 + (index * Math.PI * 2) / normalizedAxes.length;
                const x = center + Math.cos(angle) * radius;
                const y = center + Math.sin(angle) * radius;
                return (
                  <line
                    key={axis.label}
                    x1={center}
                    y1={center}
                    x2={x}
                    y2={y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                  />
                );
              })}
              <motion.g
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={shouldReduceMotion ? undefined : { scale: 0.45, opacity: 0 }}
                whileInView={shouldReduceMotion ? undefined : { scale: 1, opacity: 1 }}
                viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              >
                <polygon
                  points={points.join(' ')}
                  fill="color-mix(in srgb, var(--accent) 22%, transparent)"
                  stroke="var(--accent)"
                  strokeWidth="2"
                />
              </motion.g>
              <circle cx={center} cy={center} r="8" fill="var(--accent-2)" opacity="0.9" />
            </svg>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {normalizedAxes.map((axis) => (
              <div key={axis.label} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-4">
                <p className="ds-caption text-[color:var(--muted)]">{axis.label}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
                    initial={shouldReduceMotion ? false : { width: 0 }}
                    whileInView={{ width: `${Math.max(12, Math.min(100, axis.value))}%` }}
                    viewport={{ once: true, margin: '0px 0px -10% 0px' }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">
                  <AnimatedCounter value={axis.value} />/100
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function OperationalRail({
  title,
  items,
  className,
}: {
  readonly title: string;
  readonly items: readonly { label: string; value: string; detail?: string; tone?: Tone }[];
  readonly className?: string;
}) {
  const { t } = useLocale();
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.02),transparent)]" />
      <div className="relative grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ds-subsection text-[color:var(--text)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('engineering.operationalRail')}</p>
          </div>
          <div className="ds-caption flex items-center gap-2 text-[color:var(--muted)]">
            <Sparkles className="h-4 w-4 text-[color:var(--accent)]" />
            {t('engineering.live')}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="ds-caption text-[color:var(--muted)]">{item.label}</p>
                <span className={cn('h-2.5 w-2.5 rounded-full shadow-[0_0_14px_var(--glow)]', item.tone === 'warning' ? 'bg-[color:var(--warning)]' : item.tone === 'danger' ? 'bg-[color:var(--danger)]' : item.tone === 'success' ? 'bg-[color:var(--success)]' : 'bg-[color:var(--accent)]')} />
              </div>
              <p className="mt-3 text-lg font-semibold text-[color:var(--text)]">{item.value}</p>
              {item.detail ? <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{item.detail}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function StackEcosystemMap({
  title,
  nodes,
  className,
}: {
  readonly title: string;
  readonly nodes: readonly { label: string; value: string; detail?: string; tone?: Tone }[];
  readonly className?: string;
}) {
  const { t } = useLocale();
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_38%)]" />
      <div className="relative grid gap-4">
        <div>
          <p className="ds-subsection text-[color:var(--text)]">{title}</p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('engineering.ecosystemDetail')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {nodes.map((node, index) => (
            <div
              key={node.label}
              className={cn(
                'rounded-[var(--radius-xl)] border bg-black/15 p-4',
                toneClasses[node.tone ?? (index % 2 === 0 ? 'accent' : 'accent2')],
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="ds-caption text-[color:var(--muted)]">{node.label}</p>
                <Badge className="border-white/10 bg-white/5 text-[color:var(--text)]">{node.value}</Badge>
              </div>
              {node.detail ? <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{node.detail}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DeploymentPathSurface({
  title,
  steps,
  className,
}: {
  readonly title: string;
  readonly steps: readonly { label: string; detail: string; tone?: Tone }[];
  readonly className?: string;
}) {
  const { t } = useLocale();
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
      <div className="relative grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="ds-subsection text-[color:var(--text)]">{title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{t('engineering.deploymentDetail')}</p>
          </div>
          <Workflow className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
        </div>

        <div className="grid gap-3">
          {steps.map((step, index) => (
            <div key={step.label} className="flex gap-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold', toneClasses[step.tone ?? 'accent'])}>
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--text)]">{step.label}</p>
                <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function SurfaceLabel({
  icon,
  label,
  value,
  detail,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
      <div className="ds-caption flex items-center gap-2 text-[color:var(--muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-3 text-sm font-semibold text-[color:var(--text)]">{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{detail}</p> : null}
    </div>
  );
}

export function SurfaceIcon({ icon: Icon }: { readonly icon: typeof Cpu }) {
  return <Icon className="h-3.5 w-3.5 text-[color:var(--accent)]" aria-hidden />;
}

export function SurfaceDivider() {
  return <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden />;
}
