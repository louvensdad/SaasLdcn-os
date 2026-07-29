'use client';

import { AlertTriangle, ArrowRight, Bot, Cpu, KeyRound, Lock, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LLM_PROVIDER_OPTIONS, useActiveLlm } from '@/hooks/use-active-llm';
import { useLocale } from '@/hooks/use-locale';

interface LlmConfirmationGateProps {
  /** Canonical capability id sent to the resolver/audit (e.g. "engineering_review"). */
  readonly capability: string;
  /** Human-readable description of the action being gated (e.g. "Gerar Engineering Review"). */
  readonly usageLabel: string;
  readonly onConfirmed: (selection: { mode: 'llm' | 'deterministic'; model: string | null }) => void | Promise<void>;
  readonly compact?: boolean;
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function formatValidated(t: Translator, locale: string, value: string | null | undefined): string {
  if (!value) return t('llm.gate.neverValidated');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale);
}

/**
 * The single, premium confirmation surface shown before any AI action. It reads
 * the global provider from `useActiveLlm()` (Settings is the source of truth) and
 * renders one of three states — ready / not configured / failed — each with a
 * clear action set. The user confirms; the API key is never read here.
 */
export function LlmConfirmationGate({ capability, usageLabel, onConfirmed, compact = false }: LlmConfirmationGateProps) {
  const { t, locale } = useLocale();
  const llm = useActiveLlm();
  const ready = llm.isReady;
  const failed = llm.isFailed;
  const providerLabel = llm.providerLabel ?? 'LLM';

  async function proceed(mode: 'llm' | 'deterministic') {
    const resolution = await llm.confirmUse(capability, mode);
    await onConfirmed({ mode: resolution.mode, model: resolution.model });
  }

  const headline = ready
    ? t('llm.gate.headline.ready', { provider: providerLabel })
    : failed
      ? t('llm.gate.headline.failed', { provider: providerLabel })
      : t('llm.gate.headline.notConfigured');

  return (
    <section
      className={`relative overflow-hidden rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color:var(--surface-2)] ${compact ? 'p-4' : 'p-5'}`}
      aria-label={t('llm.gate.ariaLabel')}
      data-llm-gate={ready ? 'ready' : failed ? 'failed' : 'not-configured'}
      data-llm-capability={capability}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${failed ? 'bg-[color:var(--warning)]' : 'bg-[color:var(--accent)]'}`}
        aria-hidden
      />

      <div className="flex min-w-0 gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)]">
          {ready ? <Bot className="h-5 w-5" /> : failed ? <AlertTriangle className="h-5 w-5" /> : <Cpu className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          {/* Header: headline + provider/readiness badges */}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[color:var(--text)]">{headline}</h3>
            {ready ? <Badge tone="accent">{providerLabel}</Badge> : null}
            <Badge tone={ready ? 'success' : failed ? 'warning' : 'neutral'}>
              {ready ? t('llm.gate.status.ready') : failed ? t('llm.gate.status.needsAttention') : t('llm.gate.status.notConfigured')}
            </Badge>
          </div>

          {/* Detail grid: model, action, last validated, status reason */}
          <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="ds-caption">{t('llm.gate.field.model')}</dt>
              <dd className="text-[color:var(--text)]">{llm.model ?? '—'}</dd>
            </div>
            <div>
              <dt className="ds-caption">{t('llm.gate.field.action')}</dt>
              <dd className="text-[color:var(--text)]">{usageLabel}</dd>
            </div>
            <div>
              <dt className="ds-caption">{t('llm.gate.field.lastValidated')}</dt>
              <dd className="text-[color:var(--text)]">{formatValidated(t, locale, llm.lastValidatedAt)}</dd>
            </div>
            <div>
              <dt className="ds-caption">{t('llm.gate.field.status')}</dt>
              <dd className="text-[color:var(--text)]">{llm.reason ?? '—'}</dd>
            </div>
          </dl>

          {/* Security note — always present */}
          <p className="mt-3 flex items-center gap-1.5 ds-caption">
            <Lock className="h-3.5 w-3.5 text-[color:var(--muted)]" aria-hidden />
            {t('llm.gate.securityNote')}
          </p>

          {/* Actions — vary by state */}
          <div className="mt-5 flex flex-wrap gap-2">
            {ready ? (
              <>
                <Button variant="primary" loading={llm.isConfirming} onClick={() => void proceed('llm')}>
                  {t('llm.gate.continueWith', { provider: providerLabel })}
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="secondary" onClick={() => llm.openProviderSettings()}>
                  <Settings2 className="h-4 w-4" />
                  {t('llm.gate.switchLlm')}
                </Button>
              </>
            ) : failed ? (
              <>
                <Button variant="primary" loading={llm.isFetching} onClick={() => void llm.revalidate()}>
                  <RefreshCw className="h-4 w-4" />
                  {t('llm.gate.retest')}
                </Button>
                <Button variant="secondary" onClick={() => llm.openProviderSettings(llm.provider ?? undefined)}>
                  <KeyRound className="h-4 w-4" />
                  {t('llm.gate.updateKey')}
                </Button>
                <Button variant="secondary" onClick={() => llm.openProviderSettings()}>
                  <Settings2 className="h-4 w-4" />
                  {t('llm.gate.chooseOther')}
                </Button>
              </>
            ) : (
              LLM_PROVIDER_OPTIONS.map((provider) => (
                <Button key={provider.id} variant="secondary" onClick={() => llm.openProviderSettings(provider.id)}>
                  <ShieldCheck className="h-4 w-4" />
                  {t('llm.gate.configureProvider', { provider: provider.label })}
                </Button>
              ))
            )}

            <Button variant="ghost" loading={llm.isConfirming} onClick={() => void proceed('deterministic')}>
              <Cpu className="h-4 w-4" />
              {t('llm.gate.useDeterministic')}
            </Button>
          </div>

          {/* Deterministic fallback warning — always visible so it is never silent */}
          <p className="mt-3 flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3 py-2 ds-caption text-[color:var(--text)]/80">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[color:var(--warning)]" aria-hidden />
            {t('llm.gate.deterministicWarning')}
          </p>
        </div>
      </div>
    </section>
  );
}
