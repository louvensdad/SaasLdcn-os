'use client';

import { useMemo, useState } from 'react';
import { Clock3, Search, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';

import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/empty-states/empty-state';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { useTemplateCatalog } from '@/hooks/use-templates';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { TemplateMarketplaceItem } from '@/lib/api/types';

function formatStatus(value: string) {
  return value.replaceAll('_', ' ');
}

function estimatedTime(template: TemplateMarketplaceItem) {
  if (template.complexity === 'low') return '1–2';
  if (template.complexity === 'medium') return '3–5';
  return '6–10';
}

export default function TemplatesPage() {
  const { t } = useLocale();
  const catalogQuery = useTemplateCatalog();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [complexity, setComplexity] = useState('all');
  const catalog = catalogQuery.data;

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (catalog?.templates ?? []).filter((template) => {
      const searchable = [template.name, template.description, template.category, ...template.tags, ...template.supported_frameworks].join(' ').toLowerCase();
      return (!query || searchable.includes(query)) && (category === 'all' || template.category === category) && (complexity === 'all' || template.complexity === complexity);
    });
  }, [catalog?.templates, category, complexity, search]);

  return (
    <div className="space-y-8">
      <SectionHeader title={t('templates.title')} description={t('templates.description')} />
      <h2 className="sr-only">{t('templates.title')}</h2>

      {catalogQuery.isLoading ? (
        <div className="grid gap-4"><CardLoading /><CardLoading /></div>
      ) : catalogQuery.isError ? (
        <PageError title={t('templates.error.title')} description={getApiErrorMessage(catalogQuery.error, t('templates.error.description'))} onRetry={() => void catalogQuery.refetch()} />
      ) : !catalog || catalog.templates.length === 0 ? (
        <EmptyState kind="templates" />
      ) : (
        <>
          <Card className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--accent)_16%,transparent),transparent_36%)]" />
            <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
              <div>
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[color:var(--accent)]" /><p className="type-label text-[color:var(--muted)]">{t('templates.featured')}</p></div>
                <h2 className="mt-3 text-2xl font-semibold text-[color:var(--text)]">{t('templates.featured.title')}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{t('templates.featured.description')}</p>
              </div>
              <ActionLink href="/wizard" variant="primary">{t('templates.start')}</ActionLink>
            </div>
          </Card>

          <Card className="grid gap-3 p-4 lg:grid-cols-[1fr_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={t('templates.search')} aria-label={t('templates.search')} />
            </label>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="focus-ring rounded-full border border-[color:var(--border)] bg-[color:var(--control-bg)] px-4 py-2 text-sm text-[color:var(--text)]" aria-label={t('templates.filter.category')}>
              <option value="all">{t('templates.allCategories')}</option>
              {catalog.categories.map((item) => <option key={item} value={item}>{formatStatus(item)}</option>)}
            </select>
            <select value={complexity} onChange={(event) => setComplexity(event.target.value)} className="focus-ring rounded-full border border-[color:var(--border)] bg-[color:var(--control-bg)] px-4 py-2 text-sm text-[color:var(--text)]" aria-label={t('templates.filter.complexity')}>
              <option value="all">{t('templates.allComplexities')}</option>
              <option value="low">{t('templates.complexity.low')}</option>
              <option value="medium">{t('templates.complexity.medium')}</option>
              <option value="high">{t('templates.complexity.high')}</option>
            </select>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Badge>{t('templates.compatibilityValidated')}</Badge>
            <Badge>{t('templates.maturityVerified')}</Badge>
          </div>

          {filteredTemplates.length === 0 ? (
            <Card className="p-6"><p className="text-sm font-semibold text-[color:var(--text)]">{t('templates.noResults')}</p><Button className="mt-4" variant="secondary" onClick={() => { setSearch(''); setCategory('all'); setComplexity('all'); }}>{t('templates.clear')}</Button></Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {filteredTemplates.map((template, index) => (
                <Card key={template.id} className="group relative overflow-hidden p-6">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)] to-transparent opacity-60" />
                  <div className="relative space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div><p className="type-label text-[color:var(--muted)]">{formatStatus(template.category)}</p><h3 className="mt-2 text-2xl font-semibold text-[color:var(--text)]">{template.name}</h3></div>
                      <div className="flex flex-wrap gap-2">
                        {index < 2 ? <Badge>{t('templates.recommended')}</Badge> : null}
                        {template.maturity === 'mature' ? <Badge>{t('templates.enterpriseReady')}</Badge> : null}
                        {template.complexity === 'low' ? <Badge>{t('templates.beginnerFriendly')}</Badge> : null}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-[color:var(--muted)]">{template.description}</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Metric icon={Clock3} label={t('templates.time')} value={`${estimatedTime(template)} ${t('templates.weeks')}`} />
                      <Metric icon={ShieldCheck} label={t('templates.maturity')} value={formatStatus(template.maturity)} />
                      <Metric icon={TrendingUp} label={t('templates.compatibility')} value={template.supported_frameworks.length ? t('templates.compatible') : t('templates.review')} />
                    </div>
                    <div className="flex flex-wrap gap-2"><Badge>{formatStatus(template.complexity)}</Badge>{template.supported_frameworks.map((item) => <Badge key={item}>{item}</Badge>)}</div>
                    <p className="text-xs leading-5 text-[color:var(--muted)]">{template.changelog[0]?.changes.join(' ') ?? ''}</p>
                    <ActionLink href="/wizard" variant="primary">{t('templates.use')}</ActionLink>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { readonly icon: typeof Clock3; readonly label: string; readonly value: string }) {
  return <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.03] p-4"><Icon className="h-4 w-4 text-[color:var(--accent)]" /><p className="mt-3 text-xs text-[color:var(--muted)]">{label}</p><p className="mt-1 text-sm font-semibold capitalize text-[color:var(--text)]">{value}</p></div>;
}
