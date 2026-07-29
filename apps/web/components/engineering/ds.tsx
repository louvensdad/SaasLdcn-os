'use client';

/**
 * LDCN Engineering Design System — the shared typography + content components.
 *
 * Every page consumes these instead of inline font-size / arbitrary greys, so
 * the whole platform reads with one Enterprise-grade hierarchy. Sizes, line
 * heights, tracking and text colours all come from the `.ds-*` utilities in
 * globals.css — never hardcoded here.
 */

import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Lightbulb,
  Scale,
  type LucideIcon,
} from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'ds-text-secondary',
  accent: 'ds-text-info',
  success: 'ds-text-success',
  warning: 'ds-text-warning',
  danger: 'ds-text-danger',
  info: 'ds-text-info',
};

const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-[color:var(--accent)]',
  accent: 'bg-[color:var(--accent)]',
  success: 'bg-[color:var(--success)]',
  warning: 'bg-[color:var(--warning)]',
  danger: 'bg-[color:var(--danger)]',
  info: 'bg-[color:var(--info)]',
};

const TONE_SURFACE: Record<Tone, string> = {
  neutral: 'border-[color:var(--border)] bg-white/[0.03]',
  accent: 'border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)]',
  success: 'border-[color-mix(in_srgb,var(--success)_28%,var(--border))] bg-[color-mix(in_srgb,var(--success)_9%,transparent)]',
  warning: 'border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]',
  danger: 'border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_9%,transparent)]',
  info: 'border-[color-mix(in_srgb,var(--info)_30%,var(--border))] bg-[color-mix(in_srgb,var(--info)_9%,transparent)]',
};

// --- Headings & text --------------------------------------------------------

export function EngineeringTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('ds-page-title', className)}>{children}</h1>;
}

export function EngineeringSection({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="ds-section">{title}</h2>
          {description ? <p className="ds-caption">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EngineeringSubtitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn('ds-subsection', className)}>{children}</h3>;
}

export function EngineeringParagraph({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('ds-body ds-prose', className)}>{children}</p>;
}

export function EngineeringLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('ds-label', className)}>{children}</span>;
}

// --- Card -------------------------------------------------------------------

export function EngineeringCard({
  title,
  icon: Icon,
  children,
  className,
  header,
}: {
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  header?: ReactNode;
}) {
  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-6', className)}>
      {(title || header) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h3 className="ds-card-title flex items-center gap-2">
              {Icon ? <Icon className="h-5 w-5 text-[color:var(--accent)]" aria-hidden /> : null}
              {title}
            </h3>
          ) : <span />}
          {header}
        </div>
      )}
      {children}
    </div>
  );
}

// --- Badge (taller, more padding, consistent) -------------------------------

export function EngineeringBadge({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'ds-badge inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5',
        TONE_SURFACE[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Spaced container for groups of chips/badges so they never stick together. */
export function EngineeringChips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap gap-2', className)}>{children}</div>;
}

// --- Metric (one component for every metric, identical layout) ---------------

export function EngineeringMetric({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/[0.02] px-4 py-3', className)}>
      <p className="ds-label">{label}</p>
      <p className={cn('ds-card-title mt-1 tabular-nums', TONE_TEXT[tone])}>{value}</p>
      {hint ? <p className="ds-metadata mt-1">{hint}</p> : null}
    </div>
  );
}

export function EngineeringMetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>{children}</div>;
}

// --- Metadata key/value -----------------------------------------------------

export function EngineeringMetadata({ items, className }: { items: ReadonlyArray<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-2 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border)]/60 pb-1">
          <dt className="ds-label">{item.label}</dt>
          <dd className="ds-metadata text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// --- Callouts: decision / tradeoff / recommendation / warning / success -----

function Callout({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-[var(--radius-md)] border p-4', TONE_SURFACE[tone])}>
      <p className={cn('ds-label mb-1.5 flex items-center gap-1.5', TONE_TEXT[tone])}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </p>
      <div className="ds-body-sm ds-prose">{children}</div>
    </div>
  );
}

export function EngineeringDecision({
  area,
  choice,
  reason,
  benefits,
  tradeoffs,
  alternatives,
  className,
}: {
  area: string;
  choice: string;
  reason?: string;
  benefits?: readonly string[];
  tradeoffs?: readonly string[];
  alternatives?: readonly string[];
  className?: string;
}) {
  const { t } = useLocale();
  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white/[0.02] p-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <EngineeringLabel>{area}</EngineeringLabel>
        <EngineeringBadge tone="accent">{choice}</EngineeringBadge>
      </div>
      {reason ? (
        <p className="ds-body-sm mt-2">
          <span className="ds-text-secondary font-medium">{t('engineering.ds.reasonLabel')} </span>
          {reason}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {benefits && benefits.length > 0 ? (
          <EngineeringChecklist items={benefits} tone="success" title={t('engineering.ds.benefits')} />
        ) : null}
        {tradeoffs && tradeoffs.length > 0 ? (
          <div>
            <p className="ds-label ds-text-warning mb-1.5">{t('engineering.ds.tradeoffsLabel')}</p>
            <ul className="space-y-1">
              {tradeoffs.map((t2, i) => (
                <li key={i} className="ds-body-sm flex gap-2"><span className="ds-text-warning">•</span>{t2}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {alternatives && alternatives.length > 0 ? (
        <div className="mt-3">
          <p className="ds-label mb-1.5">{t('engineering.ds.alternativesEvaluated')}</p>
          <EngineeringChips>
            {alternatives.map((a) => <EngineeringBadge key={a} tone="neutral">{a}</EngineeringBadge>)}
          </EngineeringChips>
        </div>
      ) : null}
    </div>
  );
}

export function EngineeringTradeoff({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <Callout icon={Scale} tone="warning" title={t('engineering.ds.calloutTradeoff')}>{children}</Callout>;
}

export function EngineeringRecommendation({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <Callout icon={Lightbulb} tone="info" title={t('engineering.ds.calloutRecommendation')}>{children}</Callout>;
}

export function EngineeringWarning({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <Callout icon={AlertTriangle} tone="warning" title={t('engineering.ds.calloutWarning')}>{children}</Callout>;
}

export function EngineeringSuccess({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <Callout icon={CheckCircle2} tone="success" title={t('engineering.ds.calloutSuccess')}>{children}</Callout>;
}

// --- Checklist --------------------------------------------------------------

export function EngineeringChecklist({
  items,
  tone = 'success',
  title,
  className,
}: {
  items: readonly (string | { label: string; done?: boolean })[];
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {title ? <p className={cn('ds-label mb-1.5', TONE_TEXT[tone])}>{title}</p> : null}
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const label = typeof item === 'string' ? item : item.label;
          const done = typeof item === 'string' ? true : item.done !== false;
          return (
            <li key={i} className="ds-body-sm flex items-start gap-2">
              {done ? (
                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT[tone])} aria-hidden />
              ) : (
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border border-[color:var(--border)]" />
              )}
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Code (mono, copy, collapse) --------------------------------------------

export function EngineeringCode({
  code,
  language,
  collapsible = false,
  className,
}: {
  code: string;
  language?: string;
  collapsible?: boolean;
  className?: string;
}) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!collapsible);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-3)]', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-3 py-1.5">
        <span className="ds-metadata">{language ?? t('engineering.ds.codeFallback')}</span>
        <div className="flex items-center gap-1">
          {collapsible ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="ds-metadata inline-flex items-center gap-1 hover:text-[color:var(--text)]">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              {open ? t('engineering.ds.collapse') : t('engineering.ds.expand')}
            </button>
          ) : null}
          <button type="button" onClick={copy} className="ds-metadata inline-flex items-center gap-1 hover:text-[color:var(--text)]">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? t('engineering.ds.copied') : t('engineering.ds.copy')}
          </button>
        </div>
      </div>
      {open ? (
        <pre className="ds-code overflow-x-auto p-3 text-[color:var(--text)]/90"><code>{code}</code></pre>
      ) : null}
    </div>
  );
}

// --- Accordion (one section opens individually) -----------------------------

export function EngineeringAccordion({
  items,
  className,
}: {
  items: ReadonlyArray<{ id: string; title: string; icon?: LucideIcon; defaultOpen?: boolean; content: ReactNode; badge?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => (
        <AccordionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function AccordionRow({ item }: { item: { id: string; title: string; icon?: LucideIcon; defaultOpen?: boolean; content: ReactNode; badge?: ReactNode } }) {
  const [open, setOpen] = useState(item.defaultOpen ?? false);
  const Icon = item.icon;
  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="ds-subsection flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden /> : null}
          {item.title}
        </span>
        <span className="flex items-center gap-2">
          {item.badge}
          <ChevronDown className={cn('h-4 w-4 text-[color:var(--muted)] transition-transform', open && 'rotate-180')} aria-hidden />
        </span>
      </button>
      {open ? <div className="border-t border-[color:var(--border)] px-4 py-4">{item.content}</div> : null}
    </div>
  );
}

// --- Timeline ---------------------------------------------------------------

export function EngineeringTimeline({
  items,
  className,
}: {
  items: ReadonlyArray<{ id: string; title: string; time?: string; tone?: Tone; detail?: ReactNode }>;
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-4 border-l border-[color:var(--border)] pl-5', className)}>
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span className={cn('absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full', TONE_DOT[item.tone ?? 'accent'])} aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="ds-body-sm font-medium ds-text-primary">{item.title}</p>
            {item.time ? <span className="ds-metadata inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{item.time}</span> : null}
          </div>
          {item.detail ? <div className="ds-caption mt-1">{item.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}

// --- Table ------------------------------------------------------------------

export function EngineeringTable({
  columns,
  rows,
  className,
}: {
  columns: readonly string[];
  rows: ReadonlyArray<ReadonlyArray<ReactNode>>;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--border)]', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[color:var(--border)] bg-white/[0.03]">
            {columns.map((c) => (
              <th key={c} className="ds-label px-4 py-3 text-left">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[color:var(--border)]/60 transition-colors hover:bg-white/[0.03] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="ds-body-sm px-4 py-3 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
