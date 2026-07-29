'use client';

import type { FormEvent } from 'react';
import { Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/use-locale';
import type { Automation } from '@/lib/api/automations';

interface Props {
  readonly availableAutomations: readonly Automation[];
  readonly sourceAutomationId: string;
  readonly onSourceAutomationIdChange: (value: string) => void;
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly license: string;
  readonly onLicenseChange: (value: string) => void;
  readonly busy: boolean;
  readonly error: string | null;
  readonly success: boolean;
  readonly onSubmit: (event: FormEvent) => void;
}

/** Today's publish flow, lifted out of page.tsx verbatim -- same handlers,
 * same API contract, just re-homed. Reframed with the benefits copy the
 * redesign asks for ("Compartilhe. Monetize. Receba avaliações. Construa
 * reputação.") -- monetization/reviews are aspirational/future per the
 * platform's real scope today, phrased as an invitation, not a promise. */
export function MarketplacePublishForm({
  availableAutomations, sourceAutomationId, onSourceAutomationIdChange,
  name, onNameChange, description, onDescriptionChange, license, onLicenseChange,
  busy, error, success, onSubmit,
}: Props) {
  const { t } = useLocale();

  return (
    <Card id="marketplace-publish" className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[color:var(--text)]">
            <Rocket className="h-5 w-5 text-[color:var(--accent)]" aria-hidden />
            {t('marketplace.publish.title')}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[color:var(--muted)]">{t('marketplace.publish.description')}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]">
          <li>{t('marketplace.publish.benefit.share')}</li>
          <li>{t('marketplace.publish.benefit.monetize')}</li>
          <li>{t('marketplace.publish.benefit.reviews')}</li>
          <li>{t('marketplace.publish.benefit.reputation')}</li>
        </ul>
      </div>
      {availableAutomations.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">{t('marketplace.publish.noAutomations')}</p>
      ) : (
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.automationLabel')}</span>
            <select
              required
              value={sourceAutomationId}
              onChange={(event) => onSourceAutomationIdChange(event.target.value)}
              className="focus-ring h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-4 text-sm text-[color:var(--text)]"
            >
              <option value="">{t('marketplace.publish.automationPlaceholder')}</option>
              {availableAutomations.map((automation) => (
                <option key={automation.id} value={automation.id}>{automation.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.nameLabel')}</span>
            <Input required value={name} onChange={(event) => onNameChange(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.licenseLabel')}</span>
            <Input value={license} onChange={(event) => onLicenseChange(event.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.descriptionLabel')}</span>
            <Input value={description} onChange={(event) => onDescriptionChange(event.target.value)} />
          </label>
          {error ? <p className="sm:col-span-2 text-xs text-[color:var(--danger)]">{error}</p> : null}
          {success ? <p className="sm:col-span-2 text-xs text-[color:var(--success)]">{t('marketplace.publish.success')}</p> : null}
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" loading={busy}>{t('marketplace.publish.submit')}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
