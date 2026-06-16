'use client';

import { AlertTriangle, CheckCircle2, Hammer, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import type { GenerationValidationReport } from '@contracts/generation-validation.contract';

interface ValidationReportPanelProps {
  readonly report: GenerationValidationReport;
}

export function ValidationReportPanel({ report }: ValidationReportPanelProps) {
  const { t } = useLocale();
  const tone = report.passed ? 'success' : 'warning';
  const depCount = report.dependency_audit.findings.length;
  const securityCount = report.security_findings.length;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {report.passed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('generationValidation.title')}</h3>
        </div>
        <Badge tone={tone} className="ml-auto">{t('generationValidation.score', { score: report.score })}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('generationValidation.security')}
          </p>
          <p className="mt-1 text-sm">
            {securityCount === 0 ? t('generationValidation.noCritical') : t('generationValidation.findings', { count: securityCount })}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('generationValidation.dependencies')}</p>
          <p className="mt-1 text-sm">{report.dependency_audit.status} · {t('generationValidation.items', { count: depCount })}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Hammer className="h-3.5 w-3.5" /> {t('generationValidation.build')}
          </p>
          <p className="mt-1 text-sm">install {report.build.installed} · build {report.build.built}</p>
        </div>
      </div>

      {report.dependency_audit.findings.length > 0 && (
        <ul className="mt-3 max-h-32 overflow-auto text-xs text-muted-foreground">
          {report.dependency_audit.findings.slice(0, 8).map((finding) => (
            <li key={`${finding.ecosystem}:${finding.name}:${finding.manifest_path}`}>
              {finding.ecosystem}:{finding.name} · {finding.status}
              {finding.latest_version ? ` · latest ${finding.latest_version}` : ''}
            </li>
          ))}
        </ul>
      )}

      {report.warnings.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{report.warnings.slice(0, 2).join(' · ')}</p>
      )}
    </section>
  );
}
