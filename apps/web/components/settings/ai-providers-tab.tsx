'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive, Atom, Bot, Brain, Bug, CheckCheck, Chrome, Clock, Cog, Database, Download,
  EyeOff, FileText, FlaskConical, FolderKanban, Gem, GitMerge, Globe, GraduationCap, Hammer,
  Layout, Leaf, Package, Palette, Rocket, ScanSearch, Scale, Server, Settings2, Share2, Shield,
  ShieldCheck, Smartphone, Sparkles, Terminal, TrendingUp, Upload, Wand2, Waves, Waypoints,
  Wrench, Zap, type LucideIcon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { CardLoading } from '@/components/feedback/loading-system';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { AiProviderKeyDialog, type AiProviderDef } from '@/components/settings/ai-provider-key-dialog';
import { aiKeyVaultClient, type AiKeyListResponse } from '@/lib/api/ai-key-vault';
import { llmSettingsClient } from '@/lib/api/llm-settings';
import type { ActiveLlmSettings, LlmCacheStats, LlmModelUsage, LlmUsageStats } from '@contracts/llm-settings.contract';
import { useLocale } from '@/hooks/use-locale';
import {
  AI_AGENT_IDS, PROFILE_PRESETS, useAiPreferencesStore,
  type AiAgentId, type AiPreferencesSnapshot, type AiProfileId,
} from '@/stores/use-ai-preferences-store';

// Real platform providers only (DeepSeek/Llama/Qwen ride behind OpenRouter or
// first-class DeepSeek; Mistral is NOT supported and deliberately not listed).
// `model` = what the backend router would route for that provider today;
// `contextTokens` = registry ctx when known, null shown as em dash.
const PROVIDERS: readonly (AiProviderDef & { readonly model: string; readonly contextTokens: number | null; readonly Icon: LucideIcon; readonly color: string })[] = [
  { id: 'anthropic', name: 'Anthropic', description: 'Claude — Opus, Sonnet, Haiku, Fable.', model: 'claude-opus-4-8', contextTokens: 1_000_000, Icon: Sparkles, color: '#d97757' },
  { id: 'openai', name: 'OpenAI', description: 'GPT-4.1, o4-mini.', model: 'gpt-4.1', contextTokens: null, Icon: Atom, color: '#10a37f' },
  { id: 'google', name: 'Google', description: 'Gemini 2.5 Pro / Flash.', model: 'gemini-2.5-pro', contextTokens: null, Icon: Chrome, color: '#4285f4' },
  { id: 'deepseek', name: 'DeepSeek', description: 'DeepSeek V3 (chat) e R1 (reasoner).', model: 'deepseek-chat', contextTokens: null, Icon: Waves, color: '#4d6bfe' },
  { id: 'openrouter', name: 'OpenRouter', description: 'DeepSeek, Llama, Qwen — uma chave.', model: 'deepseek/deepseek-chat', contextTokens: null, Icon: Waypoints, color: '#8b5cf6' },
  { id: 'groq', name: 'Groq', description: 'Inferência rápida na nuvem (Llama).', model: 'llama-3.3-70b-versatile', contextTokens: null, Icon: Zap, color: '#f97316' },
  { id: 'ollama', name: 'Ollama (Local)', description: 'Modelos locais na sua máquina.', model: 'qwen2.5-coder:7b', contextTokens: null, keyless: true, Icon: Bot, color: '#0ea5e9' },
  { id: 'lmstudio', name: 'LM Studio (Local)', description: 'Modelos locais carregados no LM Studio.', model: 'local-model', contextTokens: null, keyless: true, Icon: Server, color: '#64748b' },
];

const MEMORY_ICONS: Record<string, LucideIcon> = { shortTerm: Clock, longTerm: Archive, perProject: FolderKanban, continuousLearning: TrendingUp };
const SECURITY_ICONS: Record<string, LucideIcon> = { allowInternet: Globe, sandbox: Package, detailedLogs: FileText, doubleValidation: CheckCheck, tripleCheck: ShieldCheck, execution: Terminal };
const POLICY_ICONS: Record<string, LucideIcon> = { sensitiveContent: EyeOff, storage: Database, retention: Clock, sharing: Share2, training: GraduationCap };
const PROFILE_ICONS: Record<string, LucideIcon> = { fast: Zap, balanced: Scale, quality: Gem, economic: Leaf };

const CUSTOM_PROVIDER: AiProviderDef = {
  id: 'custom', name: 'Custom', description: 'Qualquer endpoint compatível com OpenAI (vLLM, LM Studio, Together…).',
};

const PIPELINE_STEPS = [
  { id: 'generate', Icon: Wand2 },
  { id: 'analyze', Icon: ScanSearch },
  { id: 'fix', Icon: Wrench },
  { id: 'validate', Icon: ShieldCheck },
  { id: 'test', Icon: FlaskConical },
  { id: 'build', Icon: Hammer },
  { id: 'deploy', Icon: Rocket },
] as const;

const AGENT_ICONS: Record<AiAgentId, typeof Bot> = {
  architect: Bot, backend: Server, frontend: Layout, mobile: Smartphone, qa: Bug,
  security: Shield, devops: GitMerge, ux: Palette, database: Database, documentation: Sparkles,
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatDelta(current: number, previous: number): string | null {
  if (!previous) return null;
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function Sparkline({ values, color }: { readonly values: readonly number[]; readonly color: string }) {
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${28 - (value / max) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AiProvidersTab() {
  const { t } = useLocale();
  const prefs = useAiPreferencesStore();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [openProvider, setOpenProvider] = useState<AiProviderDef | null>(null);

  const statusQuery = useQuery<AiKeyListResponse>({
    queryKey: ['user-ai-keys'], queryFn: () => aiKeyVaultClient.list(), staleTime: 30_000, retry: 1,
  });
  const activeQuery = useQuery<ActiveLlmSettings>({
    queryKey: ['llm-settings', 'active'], queryFn: llmSettingsClient.active, staleTime: 30_000,
  });
  const usageQuery = useQuery<LlmUsageStats>({
    queryKey: ['llm-settings', 'usage-stats'], queryFn: llmSettingsClient.usageStats, staleTime: 30_000, retry: 1,
  });
  const cacheStatsQuery = useQuery<LlmCacheStats>({
    queryKey: ['llm-settings', 'cache-stats'], queryFn: llmSettingsClient.cacheStats, staleTime: 30_000, retry: 1,
  });
  const modelUsageQuery = useQuery<LlmModelUsage[]>({
    queryKey: ['llm-settings', 'usage-by-model'], queryFn: llmSettingsClient.usageByModel, staleTime: 30_000, retry: 1,
  });

  const keys = statusQuery.data?.keys ?? [];
  const active = activeQuery.data;
  const usage = usageQuery.data;
  const cacheStats = cacheStatsQuery.data;
  const cacheHitTotal = cacheStats ? cacheStats.hits + cacheStats.misses : 0;
  const modelUsage = modelUsageQuery.data ?? [];

  const totalTokens = usage
    ? usage.input_tokens + usage.output_tokens + usage.cache_read_tokens + usage.saved_tokens
    : 0;
  const previousTokens = usage
    ? usage.previous.input_tokens + usage.previous.output_tokens + usage.previous.cache_read_tokens + usage.previous.saved_tokens
    : 0;

  const hasKeyFor = (providerId: string) => keys.some((item) => item.provider === providerId && item.ativo);

  // Real fallback chain: active model first, then key-configured providers, Ollama last.
  const fallbackChain = useMemo(() => {
    const chain: { model: string; roleKey: string; active: boolean }[] = [];
    if (active?.model) {
      chain.push({ model: active.model, roleKey: 'primary', active: active.status === 'ready' });
    }
    for (const provider of PROVIDERS) {
      if (provider.id === active?.provider || provider.keyless) continue;
      if (hasKeyFor(provider.id)) {
        chain.push({ model: provider.model, roleKey: chain.length <= 1 ? 'backup' : 'fallback', active: true });
      }
    }
    const remaining = PROVIDERS.filter((p) => !p.keyless && p.id !== active?.provider && !hasKeyFor(p.id));
    if (chain.length < 3 && remaining.length > 0) {
      chain.push({ model: remaining[0].model, roleKey: 'fallback', active: false });
    }
    chain.push({ model: PROVIDERS.find((p) => p.id === 'ollama')!.model, roleKey: 'local', active: true });
    return chain.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.model, active?.provider, active?.status, keys]);

  function exportProfile() {
    const snapshot: AiPreferencesSnapshot = {
      sliders: prefs.sliders, flags: prefs.flags, memory: prefs.memory,
      agents: prefs.agents, security: prefs.security, profile: prefs.profile,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ldcn-ai-profile-${prefs.profile}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importProfile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as AiPreferencesSnapshot;
      if (parsed && parsed.sliders && parsed.flags && parsed.profile) prefs.importAll(parsed);
    } catch {
      // Invalid file: silently ignored -- the current profile stays untouched.
    }
  }

  const modeLabel = prefs.flags.maxQuality
    ? t('settings.aiHub.modeMaxQuality')
    : t(`settings.aiHub.profile.${prefs.profile}`);

  return (
    <div className="space-y-5">
      {/* ---- Hero: LDCN AI Engine + real 24h telemetry ---- */}
      <Card surface="primary" className="rounded-[1.5rem] p-0">
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:items-center">
          <div className="flex items-center gap-4">
            <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: 'var(--accent-gradient)' }}>
              <Brain className="h-8 w-8 text-white" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[color:var(--text)]">LDCN AI Engine</h2>
                <Badge tone={active?.status === 'ready' ? 'success' : 'neutral'}>
                  {active?.status === 'ready' ? t('settings.aiHub.active') : t('settings.aiHub.available')}
                </Badge>
              </div>
              <p className="ds-caption mt-1">{t('settings.aiHub.primaryModel')}</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--text)]">
                <Cog className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
                {active?.model ?? t('common.unavailable')}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3 border-t border-[color:var(--border)] pt-2">
                <div>
                  <p className="ds-caption">{t('settings.aiHub.provider')}</p>
                  <p className="truncate text-sm font-semibold text-[color:var(--text)]">{active?.providerLabel ?? '—'}</p>
                </div>
                <div>
                  <p className="ds-caption">{t('settings.aiHub.mode')}</p>
                  <p className="truncate text-sm font-semibold text-[color:var(--text)]">{modeLabel}</p>
                </div>
                <div>
                  <p className="ds-caption">{t('settings.aiHub.context')}</p>
                  <p className="truncate text-sm font-semibold text-[color:var(--text)]">
                    {active?.contextTokens ? t('settings.aiHub.contextTokens', { count: formatTokens(active.contextTokens) }) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:divide-x lg:divide-[color:var(--border)]">
            <MetricTile
              label={t('settings.aiHub.tokensUsed')}
              value={formatTokens(totalTokens)}
              delta={usage ? formatDelta(totalTokens, previousTokens) : null}
              values={usage?.buckets.map((b) => b.tokens) ?? []}
              color="#a78bfa"
            />
            <MetricTile
              label={t('settings.aiHub.avgLatency')}
              value={usage?.avg_latency_ms != null ? `${(usage.avg_latency_ms / 1000).toFixed(2)}s` : '—'}
              delta={usage?.avg_latency_ms != null && usage.previous.avg_latency_ms ? formatDelta(usage.avg_latency_ms, usage.previous.avg_latency_ms) : null}
              values={usage?.buckets.map((b) => b.avg_latency_ms) ?? []}
              color="#60a5fa"
              invertDelta
            />
            <MetricTile
              label={t('settings.aiHub.requests')}
              value={usage ? usage.requests.toLocaleString('pt-BR') : '—'}
              delta={usage ? formatDelta(usage.requests, usage.previous.requests) : null}
              values={usage?.buckets.map((b) => b.requests) ?? []}
              color="#34d399"
            />
            <MetricTile
              label={t('settings.aiHub.estimatedCost')}
              value={usage ? `$${usage.estimated_cost_usd.toFixed(2)}` : '—'}
              delta={usage ? formatDelta(usage.estimated_cost_usd, usage.previous.estimated_cost_usd) : null}
              values={usage?.buckets.map((b) => b.cost_usd) ?? []}
              color="#fb923c"
              invertDelta
            />
          </div>
        </div>
      </Card>

      {/* ---- Row 2: Providers | Pipeline + Fallback | Parameters ---- */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Sparkles className="h-4 w-4" />} title={t('settings.aiHub.providersTitle')} description={t('settings.aiHub.providersDescription')} />
          {statusQuery.isLoading ? (
            <CardLoading />
          ) : (
            <div className="mt-4 space-y-2">
              {PROVIDERS.map((provider) => {
                const configured = provider.keyless || hasKeyFor(provider.id);
                return (
                  <div key={provider.id} className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[color:var(--border)] p-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: `color-mix(in srgb, ${provider.color} 15%, transparent)`, color: provider.color }}>
                      <provider.Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-[4.5rem] flex-1">
                      <p className="truncate text-sm font-semibold text-[color:var(--text)]">{provider.name}</p>
                      <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium" style={{ color: configured ? 'var(--success)' : 'var(--muted)' }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: configured ? 'var(--success)' : 'var(--muted-2)' }} aria-hidden />
                        {configured ? t('settings.aiHub.active') : t('settings.aiHub.available')}
                      </span>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="ds-caption">{t('settings.aiHub.model')}</p>
                      <p className="t-mono max-w-[7.5rem] truncate text-xs text-[color:var(--text)]">{provider.model}</p>
                    </div>
                    <IconButton size="sm" variant="secondary" aria-label={t('settings.aiHub.configureProvider', { provider: provider.name })} onClick={() => setOpenProvider(provider)}>
                      <Settings2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setOpenProvider(CUSTOM_PROVIDER)}
                className="focus-ring w-full rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] p-2.5 text-sm font-medium text-[color:var(--accent)] transition-colors hover:border-[color:var(--accent)]"
              >
                + {t('settings.aiHub.addCustomProvider')}
              </button>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card surface="secondary" className="rounded-[1.5rem] p-5">
            <SectionHeading icon={<GitMerge className="h-4 w-4" />} title={t('settings.aiHub.pipelineTitle')} description={t('settings.aiHub.pipelineDescription')} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {PIPELINE_STEPS.map(({ id, Icon }, index) => (
                <div key={id} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-[color:var(--border)]" style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)' }}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-xs font-medium text-[color:var(--muted)]">{t(`settings.aiHub.pipeline.${id}`)}</span>
                  </div>
                  {index < PIPELINE_STEPS.length - 1 ? <span className="mb-4 h-1 w-1 rounded-full bg-[color:var(--muted-2)]" aria-hidden /> : null}
                </div>
              ))}
            </div>
          </Card>

          <Card surface="secondary" className="rounded-[1.5rem] p-5">
            <SectionHeading icon={<Bot className="h-4 w-4" />} title={t('settings.aiHub.fallbackTitle')} description={t('settings.aiHub.fallbackDescription')} />
            <ol className="mt-4 space-y-2">
              {fallbackChain.map((entry, index) => (
                <li key={`${entry.model}-${index}`} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] text-sm font-bold text-[color:var(--accent)]">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                    <div className="min-w-0">
                      <p className="ds-caption">{t(`settings.aiHub.fallbackRole.${entry.roleKey}`)}</p>
                      <p className="truncate text-sm font-semibold text-[color:var(--text)]">{entry.model}</p>
                    </div>
                    <Badge tone={entry.active ? 'success' : 'neutral'}>
                      {entry.active ? t('settings.aiHub.active') : t('settings.aiHub.available')}
                    </Badge>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Settings2 className="h-4 w-4" />} title={t('settings.aiHub.parametersTitle')} description={t('settings.aiHub.parametersDescription')} />
          <div className="mt-4 space-y-3.5">
            {([
              ['creativity', prefs.sliders.creativity],
              ['precision', prefs.sliders.precision],
              ['speed', prefs.sliders.speed],
              ['contextUsage', prefs.sliders.contextUsage],
              ['memoryUsage', prefs.sliders.memoryUsage],
            ] as const).map(([key, value]) => (
              <label key={key} className="block">
                <span className="flex items-center justify-between text-sm font-medium text-[color:var(--text)]">
                  {t(`settings.aiHub.slider.${key}`)}
                  <span className="t-mono text-xs text-[color:var(--muted)]">{value}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={value}
                  onChange={(event) => prefs.setSlider(key, Number(event.target.value))}
                  className="mt-1.5 w-full accent-[var(--accent)]"
                />
              </label>
            ))}
          </div>
          <div className="mt-5 space-y-3 border-t border-[color:var(--border)] pt-4">
            {([
              ['detailedExplanations', prefs.flags.detailedExplanations],
              ['devMode', prefs.flags.devMode],
              ['economicMode', prefs.flags.economicMode],
              ['maxQuality', prefs.flags.maxQuality],
              ['autoReview', prefs.flags.autoReview],
            ] as const).map(([key, value]) => (
              <SettingsToggleRow key={key} label={t(`settings.aiHub.flag.${key}`)} checked={value} onChange={(next) => prefs.setFlag(key, next)} />
            ))}
          </div>
        </Card>
      </div>

      {/* ---- Row 3: Memory | Tokens & Costs | Agents ---- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Brain className="h-4 w-4" />} title={t('settings.aiHub.memoryTitle')} description={t('settings.aiHub.memoryDescription')} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {([
              ['shortTerm', prefs.memory.shortTerm],
              ['longTerm', prefs.memory.longTerm],
              ['perProject', prefs.memory.perProject],
              ['continuousLearning', prefs.memory.continuousLearning],
            ] as const).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => prefs.setMemory(key, !value)}
                className="focus-ring rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-left transition-colors hover:border-[color:var(--accent)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {(() => { const Icon = MEMORY_ICONS[key]; return <Icon className="h-4 w-4 shrink-0 text-[color:var(--accent)]" aria-hidden />; })()}
                    <p className="min-w-0 truncate text-sm font-semibold text-[color:var(--text)]">{t(`settings.aiHub.memory.${key}`)}</p>
                  </span>
                  <Badge tone={value ? 'success' : 'neutral'} className="shrink-0 whitespace-nowrap">{value ? t('settings.aiHub.memoryActive') : t('settings.aiHub.memoryOff')}</Badge>
                </div>
                <p className="mt-1 ds-caption">{t(`settings.aiHub.memoryHint.${key}`)}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Sparkles className="h-4 w-4" />} title={t('settings.aiHub.tokensTitle')} description={t('settings.aiHub.tokensDescription')} />
          {usage ? (
            <TokensBreakdown usage={usage} totalTokens={totalTokens} />
          ) : (
            <p className="mt-4 ds-caption">{t('settings.aiHub.tokensEmpty')}</p>
          )}
          {cacheStats ? (
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[color:var(--border)] pt-3">
              <div>
                <p className="ds-caption">{t('settings.aiHub.cacheHitRate')}</p>
                <p className="text-lg font-bold text-[color:var(--text)]">
                  {cacheHitTotal > 0 ? `${((cacheStats.hits / cacheHitTotal) * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="ds-caption">{t('settings.aiHub.cacheEntries')}</p>
                <p className="text-lg font-bold text-[color:var(--text)]">{cacheStats.entries.toLocaleString('pt-BR')}</p>
              </div>
            </div>
          ) : null}
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Bot className="h-4 w-4" />} title={t('settings.aiHub.agentsTitle')} description={t('settings.aiHub.agentsDescription')} />
          <div className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {AI_AGENT_IDS.map((agent) => {
              const Icon = AGENT_ICONS[agent];
              return (
                <div key={agent} className="flex items-center justify-between gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--text)]">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--muted)]" aria-hidden />
                    <span className="truncate">{t(`settings.aiHub.agent.${agent}`)}</span>
                  </span>
                  <MiniToggle checked={prefs.agents[agent]} onChange={(next) => prefs.setAgent(agent, next)} label={t(`settings.aiHub.agent.${agent}`)} />
                </div>
              );
            })}
          </div>
          <Button variant="secondary" className="mt-4 w-full" disabled title={t('settings.aiHub.manageAgentsSoon')}>
            {t('settings.aiHub.manageAgents')}
          </Button>
        </Card>
      </div>

      {/* ---- Model comparison: real per-model usage, not a synthetic benchmark ---- */}
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <SectionHeading icon={<Gem className="h-4 w-4" />} title={t('settings.aiHub.modelComparisonTitle')} description={t('settings.aiHub.modelComparisonDescription')} />
        {modelUsage.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-[color:var(--muted)]">
                  <th className="pb-2 font-medium">{t('settings.aiHub.modelComparisonModel')}</th>
                  <th className="pb-2 font-medium">{t('settings.aiHub.requests')}</th>
                  <th className="pb-2 font-medium">{t('settings.aiHub.avgLatency')}</th>
                  <th className="pb-2 font-medium">{t('settings.aiHub.estimatedCost')}</th>
                  <th className="pb-2 font-medium">{t('settings.aiHub.cacheHitRate')}</th>
                </tr>
              </thead>
              <tbody>
                {modelUsage.map((entry) => (
                  <tr key={entry.model} className="border-t border-[color:var(--border)]">
                    <td className="py-2">
                      <p className="t-mono text-xs font-semibold text-[color:var(--text)]">{entry.model}</p>
                      <p className="ds-caption">{entry.provider}</p>
                    </td>
                    <td className="py-2 t-mono">{entry.requests.toLocaleString('pt-BR')}</td>
                    <td className="py-2 t-mono">{entry.avg_latency_ms != null ? `${(entry.avg_latency_ms / 1000).toFixed(2)}s` : '—'}</td>
                    <td className="py-2 t-mono">${entry.estimated_cost_usd.toFixed(2)}</td>
                    <td className="py-2 t-mono">{(entry.cache_hit_rate * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 ds-caption">{t('settings.aiHub.modelComparisonEmpty')}</p>
        )}
      </Card>

      {/* ---- Row 4: Security | Usage policies | Profiles ---- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Shield className="h-4 w-4" />} title={t('settings.aiHub.securityTitle')} description={t('settings.aiHub.securityDescription')} />
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {([
              ['allowInternet', prefs.security.allowInternet],
              ['sandbox', prefs.security.sandbox],
              ['detailedLogs', prefs.security.detailedLogs],
              ['doubleValidation', prefs.security.doubleValidation],
              ['tripleCheck', prefs.security.tripleCheck],
            ] as const).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => prefs.setSecurity(key, !value)}
                className="focus-ring rounded-[var(--radius-md)] border border-[color:var(--border)] p-3 text-left transition-colors hover:border-[color:var(--accent)]"
              >
                {(() => { const Icon = SECURITY_ICONS[key]; return <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />; })()}
                <p className="mt-1.5 text-xs font-semibold text-[color:var(--text)]">{t(`settings.aiHub.security.${key}`)}</p>
                <p className={value ? 'mt-0.5 text-xs font-medium text-[color:var(--success)]' : 'mt-0.5 text-xs font-medium text-[color:var(--muted)]'}>
                  {value ? t('settings.aiHub.securityOn') : t('settings.aiHub.securityOffState')}
                </p>
              </button>
            ))}
            {/* Command execution is genuinely allowlist-restricted server-side -- not a client toggle. */}
            <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
              <Terminal className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
              <p className="mt-1.5 text-xs font-semibold text-[color:var(--text)]">{t('settings.aiHub.security.execution')}</p>
              <p className="mt-0.5 text-xs font-medium text-[color:var(--warning,#eab308)]">{t('settings.aiHub.securityRestricted')}</p>
            </div>
          </div>
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<ShieldCheck className="h-4 w-4" />} title={t('settings.aiHub.policiesTitle')} description={t('settings.aiHub.policiesDescription')} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(['sensitiveContent', 'storage', 'retention', 'sharing', 'training'] as const).map((key) => {
              const Icon = POLICY_ICONS[key];
              return (
                <div key={key} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
                  <Icon className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
                  <p className="mt-1.5 text-xs font-semibold text-[color:var(--text)]">{t(`settings.aiHub.policy.${key}`)}</p>
                  <p className="mt-0.5 text-xs font-medium text-[color:var(--muted)]">{t(`settings.aiHub.policyValue.${key}`)}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Wand2 className="h-4 w-4" />} title={t('settings.aiHub.profilesTitle')} description={t('settings.aiHub.profilesDescription')} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(Object.keys(PROFILE_PRESETS) as AiProfileId[]).map((profile) => {
              const selected = prefs.profile === profile;
              const Icon = PROFILE_ICONS[profile];
              return (
                <button
                  key={profile}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => prefs.setProfile(profile)}
                  className="focus-ring rounded-[var(--radius-md)] border p-3 text-left transition-colors"
                  style={selected
                    ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }
                    : { borderColor: 'var(--border)' }}
                >
                  <Icon className="h-4 w-4" style={{ color: selected ? 'var(--accent)' : 'var(--muted)' }} aria-hidden />
                  <p className="mt-1.5 text-sm font-semibold text-[color:var(--text)]">{t(`settings.aiHub.profile.${profile}`)}</p>
                  <p className="mt-0.5 ds-caption">{t(`settings.aiHub.profileHint.${profile}`)}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void importProfile(file);
              }}
            />
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {t('settings.aiHub.importProfile')}
            </Button>
            <Button variant="secondary" onClick={exportProfile}>
              <Download className="h-4 w-4" /> {t('settings.aiHub.exportProfile')}
            </Button>
          </div>
        </Card>
      </div>

      {openProvider ? (
        <AiProviderKeyDialog
          open
          onClose={() => setOpenProvider(null)}
          def={openProvider}
          keys={keys.filter((item) => item.provider === openProvider.id)}
        />
      ) : null}
    </div>
  );
}

function SectionHeading({ icon, title, description }: { readonly icon: ReactNode; readonly title: string; readonly description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[color:var(--text)]">{title}</h3>
        <p className="ds-caption mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function MetricTile({ label, value, delta, values, color, invertDelta = false }: {
  readonly label: string;
  readonly value: string;
  readonly delta: string | null;
  readonly values: readonly number[];
  readonly color: string;
  readonly invertDelta?: boolean;
}) {
  const positive = delta?.startsWith('+') ?? false;
  const good = invertDelta ? !positive : positive;
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="ds-caption">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[color:var(--text)]">{value}</p>
      {delta ? (
        <p className="text-xs font-semibold" style={{ color: good ? 'var(--success)' : 'var(--danger)' }}>{delta}</p>
      ) : (
        <p className="text-xs text-[color:var(--muted)]">—</p>
      )}
      <Sparkline values={values.length > 0 ? values : [0, 0]} color={color} />
    </div>
  );
}

function TokensBreakdown({ usage, totalTokens }: { readonly usage: LlmUsageStats; readonly totalTokens: number }) {
  const { t } = useLocale();
  const segments = [
    { key: 'input', value: usage.input_tokens, color: '#8b5cf6' },
    { key: 'output', value: usage.output_tokens, color: '#60a5fa' },
    { key: 'cache', value: usage.cache_read_tokens, color: '#34d399' },
    { key: 'saved', value: usage.saved_tokens, color: '#fbbf24' },
  ] as const;
  const total = Math.max(totalTokens, 1);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={radius} fill="none" stroke="color-mix(in srgb, var(--border) 60%, transparent)" strokeWidth="12" />
            {segments.map((segment) => {
              const fraction = segment.value / total;
              const dash = fraction * circumference;
              const element = (
                <circle
                  key={segment.key}
                  cx="50" cy="50" r={radius} fill="none"
                  stroke={segment.color} strokeWidth="12"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return element;
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <p className="text-xl font-bold text-[color:var(--text)]">{formatTokens(totalTokens)}</p>
              <p className="text-xs text-[color:var(--muted)]">{t('settings.aiHub.tokens24h')}</p>
            </div>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-[color:var(--muted)]">
                <span className="h-2 w-2 rounded-full" style={{ background: segment.color }} aria-hidden />
                {t(`settings.aiHub.tokenSegment.${segment.key}`)}
              </span>
              <span className="t-mono font-semibold text-[color:var(--text)]">
                {formatTokens(segment.value)} ({((segment.value / total) * 100).toFixed(1)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[color:var(--border)] pt-3">
        <div>
          <p className="ds-caption">{t('settings.aiHub.estimatedCost')}</p>
          <p className="text-lg font-bold text-[color:var(--text)]">${usage.estimated_cost_usd.toFixed(2)}</p>
        </div>
        <div>
          <p className="ds-caption">{t('settings.aiHub.cacheSavings')}</p>
          <p className="text-lg font-bold text-[color:var(--success)]">${usage.cache_savings_usd.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

function MiniToggle({ checked, onChange, label }: { readonly checked: boolean; readonly onChange: (value: boolean) => void; readonly label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="focus-ring inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-[color:var(--border)] p-0.5 transition-colors"
      style={checked ? { background: 'color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}
    >
      <span className="h-3.5 w-3.5 rounded-full bg-[color:var(--text)] transition-transform" style={{ transform: checked ? 'translateX(14px)' : 'translateX(0)' }} />
    </button>
  );
}
