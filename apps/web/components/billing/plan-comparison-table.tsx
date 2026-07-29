'use client';

import { Check, Minus } from 'lucide-react';

import { AccordionItem } from '@/components/ui/accordion';
import { useLocale } from '@/hooks/use-locale';
import type { PlanView } from '@/lib/api/billing-catalog';

const LIMIT_ROWS = [
  'active_projects', 'workspaces', 'members', 'preview_instances', 'monthly_builds',
  'storage_bytes', 'deployments', 'automation_executions', 'version_retention',
] as const;

// Base features every plan already grants (PROJECT_CREATE, PROMPT_GENERATE, ...)
// aren't interesting for a comparison -- only the ones that actually vary.
const FEATURE_ROWS = ['WORKSPACE_CREATE', 'AUTOMATION_EXECUTE', 'ANALYTICS_ADVANCED', 'DEPLOY_EXECUTE', 'API_ACCESS', 'MARKETPLACE_ACCESS', 'AI_OBSERVABILITY'] as const;

interface PlanComparisonTableProps {
  readonly plans: readonly PlanView[];
}

function formatLimitValue(code: string, value: number | null, configurableLabel: string): string {
  if (value === null) return configurableLabel;
  if (code === 'storage_bytes') return `${Math.round(value / 1024 ** 3)} GB`;
  return String(value);
}

export function PlanComparisonTable({ plans }: PlanComparisonTableProps) {
  const { t } = useLocale();

  return (
    <AccordionItem title={t('billing.compare.title')} subtitle={t('billing.compare.subtitle')}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)]">
              <th className="py-2 pr-3 text-left font-medium text-[color:var(--muted)]">{t('billing.compare.capability')}</th>
              {plans.map((plan) => (
                <th key={plan.code} className="px-3 py-2 text-left font-semibold text-[color:var(--text)]">{plan.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LIMIT_ROWS.map((code) => (
              <tr key={code} className="border-b border-[color:var(--border)]">
                <td className="py-2 pr-3 text-[color:var(--muted)]">{t(`pricing.limit.${code}`)}</td>
                {plans.map((plan) => (
                  <td key={plan.code} className="px-3 py-2 text-[color:var(--text)]">
                    {formatLimitValue(code, plan.limits[code] ?? null, t('billing.compare.configurable'))}
                  </td>
                ))}
              </tr>
            ))}
            {FEATURE_ROWS.map((code) => (
              <tr key={code} className="border-b border-[color:var(--border)]">
                <td className="py-2 pr-3 text-[color:var(--muted)]">{t(`pricing.feature.${code}`)}</td>
                {plans.map((plan) => (
                  <td key={plan.code} className="px-3 py-2">
                    {plan.features.includes(code) ? (
                      <Check className="h-4 w-4 text-[color:var(--success)]" aria-label={t('billing.compare.included')} />
                    ) : (
                      <Minus className="h-4 w-4 text-[color:var(--muted-2)]" aria-label={t('billing.compare.notIncluded')} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccordionItem>
  );
}
