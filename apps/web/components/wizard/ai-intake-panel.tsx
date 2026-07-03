'use client';

import { useState } from 'react';
import { AlertTriangle, KeyRound, Loader2, Sparkles, Wand2 } from 'lucide-react';

import { UserKeyPanel } from '@/components/llm/user-key-panel';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useProjectSpec } from '@/hooks/use-project-spec';
import { MODELS } from '@/lib/llm/models';
import { cn } from '@/lib/cn';
import type { OrchestrateResponse, PriorAnswer, ProjectSpec } from '@/lib/api/meta-factory';

interface AiIntakePanelProps {
  /** Called with the AI spec so the wizard can seed Step 1 + the suggested stack. */
  readonly onApply: (spec: ProjectSpec) => void;
}

const MIN_INTENT = 12;

/**
 * AI intake for the wizard's Step 1. The expert describes the system in natural
 * language; the orchestrator LLM returns a structured spec that seeds the form so
 * it's never a blank, intimidating page — only a draft to review and refine.
 */
export function AiIntakePanel({ onApply }: AiIntakePanelProps) {
  const { t } = useLocale();
  const [intent, setIntent] = useState('');
  const [model, setModel] = useState('');
  const [useUserKey, setUseUserKey] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [lastResult, setLastResult] = useState<OrchestrateResponse | null>(null);

  const spec = useProjectSpec();
  const result = spec.data ?? lastResult;
  const questions = result?.open_questions ?? [];
  const selectedModel = MODELS.find((item) => item.id === model);

  function generate(priorAnswers: PriorAnswer[] = []) {
    if (intent.trim().length < MIN_INTENT) return;
    spec.mutate(
      { rawIntent: intent.trim(), priorAnswers, model, useUserKey },
      {
        onSuccess: (response) => {
          setLastResult(response);
          onApply(response.spec);
        },
      },
    );
  }

  function refine() {
    const priorAnswers: PriorAnswer[] = questions.map((question) => ({
      id: question.id,
      answer: answers[question.id]?.trim() || question.default_if_skipped,
    }));
    generate(priorAnswers);
  }

  const confidencePct = result ? Math.round((result.spec.confidence ?? 0) * 100) : 0;

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_10%,transparent),transparent)] p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_36%)]" />
      <div className="relative space-y-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--accent)]">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="ds-caption text-[color:var(--accent)]">{t('wizard.intake.eyebrow')}</p>
            <h3 className="mt-1 text-xl font-semibold text-[color:var(--text)]">{t('wizard.intake.title')}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted)]">{t('wizard.intake.subtitle')}</p>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.intake.describeLabel')}</span>
          <textarea
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            rows={4}
            placeholder={t('wizard.intake.placeholder')}
            className="focus-ring mt-2 min-h-28 w-full resize-y rounded-2xl border border-[color:var(--border)] bg-white/5 px-4 py-3 text-sm text-[color:var(--text)] placeholder:text-[color:var(--muted)] outline-none transition duration-200"
          />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--muted)]">
            {t('wizard.intake.model')}
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--control-bg)] px-3 py-2 text-sm text-[color:var(--text)]"
            >
              {MODELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id ? option.label : t('wizard.intake.autoModel')}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="primary"
            className="ml-auto"
            onClick={() => generate()}
            disabled={spec.isPending || intent.trim().length < MIN_INTENT}
          >
            {spec.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {spec.isPending ? t('wizard.intake.generating') : t('wizard.intake.generate')}
          </Button>
        </div>

        {selectedModel?.local ? (
          <p className="text-xs text-[color:var(--success)]">{t('wizard.intake.localModelHint')}</p>
        ) : null}
        {selectedModel?.custom ? (
          <p className="text-xs text-[color:var(--success)]">{t('wizard.intake.customModelHint')}</p>
        ) : null}

        <UserKeyPanel enabled={useUserKey} onEnabledChange={setUseUserKey} />

        {spec.isError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[color:var(--danger)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {spec.error?.message || t('wizard.intake.error')}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-4 rounded-[var(--radius-xl)] border border-white/10 bg-black/15 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
                <Sparkles className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
                {t('wizard.intake.applied')}
              </div>
              <div className="flex items-center gap-3">
                {result.degraded ? (
                  <span className="rounded-full border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] px-2.5 py-0.5 text-xs font-semibold text-[color:var(--warning)]">
                    {t('wizard.intake.degraded')}
                  </span>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[color:var(--muted)]">{t('wizard.intake.confidence')}</span>
                  <span className="text-sm font-semibold text-[color:var(--text)]">{confidencePct}%</span>
                </div>
              </div>
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[color:var(--accent)] transition-[width] duration-500"
                style={{ width: `${confidencePct}%` }}
              />
            </div>

            {result.spec.suggested_stack ? (
              <div className="grid gap-2 text-xs leading-5 text-[color:var(--muted)]">
                <p className="text-[color:var(--text)]">
                  <span className="font-semibold">{t('wizard.intake.suggestedStack')}:</span>{' '}
                  {[
                    result.spec.suggested_stack.language,
                    result.spec.suggested_stack.framework,
                    result.spec.suggested_stack.architecture,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {result.spec.suggested_stack.architecture_reason ? (
                  <p>{result.spec.suggested_stack.architecture_reason}</p>
                ) : null}
              </div>
            ) : null}

            {result.spec.assumptions?.length ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]">
                  {t('wizard.intake.assumptions')}
                </p>
                <ul className="space-y-1 text-xs leading-5 text-[color:var(--muted)]">
                  {result.spec.assumptions.map((assumption) => (
                    <li key={assumption.field}>
                      <span className="font-semibold text-[color:var(--text)]">{assumption.field}:</span>{' '}
                      {assumption.assumed_value}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {questions.length ? (
              <div className="space-y-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4">
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.intake.refineQuestions')}</p>
                <div className="grid gap-3">
                  {questions.map((question) => (
                    <label key={question.id} className="block text-sm">
                      <span className="font-medium text-[color:var(--text)]">{question.question}</span>
                      <span className="mt-0.5 block text-xs text-[color:var(--muted)]">{question.why_it_matters}</span>
                      <input
                        value={answers[question.id] ?? ''}
                        onChange={(event) =>
                          setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))
                        }
                        placeholder={t('wizard.intake.defaultAnswer', { value: question.default_if_skipped })}
                        className="focus-ring mt-2 w-full rounded-lg border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)] outline-none"
                      />
                    </label>
                  ))}
                </div>
                <Button type="button" variant="secondary" onClick={refine} disabled={spec.isPending}>
                  {spec.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {t('wizard.intake.refine')}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
              <p className="text-xs text-[color:var(--muted)]">{t('wizard.intake.reviewNote')}</p>
              <Button
                type="button"
                variant="ghost"
                className={cn('ml-auto')}
                onClick={() => onApply(result.spec)}
                disabled={spec.isPending}
              >
                {t('wizard.intake.reapply')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
