'use client';

import { AlertTriangle, CheckCircle2, FileCode2, ListChecks } from 'lucide-react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import type { CompletenessReport, CoverageStatus, RuleCoverage } from '@/lib/api/meta-factory';

interface CompletenessPanelProps {
  readonly report: CompletenessReport;
  readonly onEvidenceClick?: (path: string) => void;
}

const STATUS_TONE: Record<CoverageStatus, BadgeTone> = {
  covered: 'success',
  partial: 'warning',
  missing: 'danger',
};

const STATUS_ICON = {
  covered: CheckCircle2,
  partial: AlertTriangle,
  missing: AlertTriangle,
};

export function CompletenessPanel({ report, onEvidenceClick }: CompletenessPanelProps) {
  const { t } = useLocale();
  const groups: Record<CoverageStatus, RuleCoverage[]> = {
    covered: report.items.filter((item) => item.status === 'covered'),
    partial: report.items.filter((item) => item.status === 'partial'),
    missing: report.items.filter((item) => item.status === 'missing'),
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[color:var(--accent)]" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('metaFactory.completeness.title')}
          </h3>
        </div>
        <Badge tone={report.completeness_score >= 80 ? 'success' : report.completeness_score >= 55 ? 'warning' : 'danger'} className="ml-auto">
          {t('metaFactory.completeness.score', { score: report.completeness_score })}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {(['covered', 'partial', 'missing'] as const).map((status) => {
          const Icon = STATUS_ICON[status];
          return (
            <div key={status} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {t(`metaFactory.completeness.${status}`)}
              </p>
              <p className="mt-1 text-sm">{groups[status].length}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex max-h-64 flex-col gap-3 overflow-auto">
        {(['missing', 'partial', 'covered'] as const).flatMap((status) =>
          groups[status].map((item) => (
            <div key={`${item.kind}:${item.item}`} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex flex-wrap items-start gap-2">
                <Badge tone={STATUS_TONE[item.status]}>{t(`metaFactory.completeness.${item.status}`)}</Badge>
                <p className="min-w-0 flex-1 text-sm font-medium">{item.item}</p>
              </div>
              {item.note && <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.evidence.length === 0 ? (
                  <span className="text-xs text-muted-foreground">{t('metaFactory.completeness.noEvidence')}</span>
                ) : (
                  item.evidence.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => onEvidenceClick?.(path)}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground transition hover:border-[color-mix(in_srgb,var(--accent)_50%,transparent)] hover:text-[color:var(--accent)]"
                    >
                      <FileCode2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{path}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )),
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryList title={t('metaFactory.completeness.gaps')} empty={t('metaFactory.completeness.noGaps')} items={report.gaps} />
        <SummaryList
          title={t('metaFactory.completeness.recommendations')}
          empty={t('metaFactory.completeness.noRecommendations')}
          items={report.recommendations}
        />
      </div>
    </section>
  );
}

function SummaryList({ title, empty, items }: { title: string; empty: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {items.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
