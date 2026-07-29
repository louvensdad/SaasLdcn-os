'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useLocale } from '@/hooks/use-locale';
import { EngineeringTable } from '@/components/engineering/ds';
import { cn } from '@/lib/cn';

const CHECK = '✅';
const DASH = '—';

export function ExecutionProfileComparisonToggle() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring ds-metadata inline-flex items-center gap-1 text-[color:var(--muted)] hover:text-[color:var(--text)]"
        aria-expanded={open}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {t('executionProfile.compareToggle')}
      </button>
      {open ? <ExecutionProfileComparisonTable className="mt-3" /> : null}
    </div>
  );
}

export function ExecutionProfileComparisonTable({ className }: { className?: string }) {
  const { t } = useLocale();
  // Economy / Professional / Enterprise are the spec's fixed display names —
  // proper nouns, not translated per locale (mirrors the backend registry).
  const columns = [t('executionProfile.compare.feature'), 'Economy', 'Professional', 'Enterprise'];
  const rows: ReadonlyArray<ReadonlyArray<string>> = [
    [t('executionProfile.compare.buildValid'), CHECK, CHECK, CHECK],
    [t('executionProfile.compare.qaRequired'), CHECK, CHECK, CHECK],
    [
      t('executionProfile.compare.autoRepair'),
      t('executionProfile.compare.autoRepair.economy'),
      t('executionProfile.compare.autoRepair.professional'),
      t('executionProfile.compare.autoRepair.enterprise'),
    ],
    [t('executionProfile.compare.architectureReview'), DASH, CHECK, CHECK],
    [t('executionProfile.compare.importGraph'), DASH, CHECK, CHECK],
    [t('executionProfile.compare.dependencyGraph'), DASH, CHECK, CHECK],
    [
      t('executionProfile.compare.securityReview'),
      DASH,
      t('executionProfile.compare.securityReview.professional'),
      t('executionProfile.compare.securityReview.enterprise'),
    ],
    [t('executionProfile.compare.performanceReview'), DASH, DASH, CHECK],
    [t('executionProfile.compare.buildGuarantee'), CHECK, CHECK, CHECK],
    [
      t('executionProfile.compare.productCertification'),
      t('executionProfile.compare.productCertification.economy'),
      t('executionProfile.compare.productCertification.professional'),
      t('executionProfile.compare.productCertification.enterprise'),
    ],
    [t('executionProfile.time.label'), t('executionProfile.time.economy'), t('executionProfile.time.professional'), t('executionProfile.time.enterprise')],
    [t('executionProfile.cost.label'), t('executionProfile.cost.economy'), t('executionProfile.cost.professional'), t('executionProfile.cost.enterprise')],
  ];
  return <EngineeringTable columns={columns} rows={rows} className={className} />;
}
