'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useLocale } from '@/hooks/use-locale';
import { getMissionGenome, isRegisteredMissionType } from '@/modules/mission-workspace/registry';
import { useMissionStore } from '@/modules/mission-workspace/stores/missionStore';
import type { ExecutionMode, ExperienceLevel } from '@/modules/mission-workspace/types';

const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

export default function NewMissionPage() {
  const router = useRouter();
  const type = useSearchParams().get('type') ?? '';
  const genome = isRegisteredMissionType(type) ? getMissionGenome(type) : null;
  const startMission = useMissionStore((state) => state.startMission);
  const error = useMissionStore((state) => state.error);
  const { t } = useLocale();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<ExecutionMode>(genome?.executionModes[0] ?? 'guided');
  const [level, setLevel] = useState<ExperienceLevel>('intermediate');
  const [busy, setBusy] = useState(false);

  if (!genome) {
    return (
      <div className="p-8 text-red-300">
        {t('missions.unknownType')} <Link href="/wizard">{t('missions.back')}</Link>
      </div>
    );
  }

  async function create() {
    if (!genome) return;
    setBusy(true);
    try {
      const mission = await startMission(genome.id, {
        title: title.trim() || genome.title,
        mode,
        experienceLevel: level,
      });
      router.push(`/wizard/${mission.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/wizard" className="mb-6 inline-flex items-center gap-2 text-sm text-[color:var(--muted)]">
        <ArrowLeft className="h-4 w-4" />
        {t('missions.back')}
      </Link>
      <section className="rounded-2xl border border-[color:var(--border)] bg-white/5 p-7">
        <p className="ds-caption text-[color:var(--accent)]">{t('missions.new.eyebrow')}</p>
        <h1 className="mt-2 text-2xl font-semibold">{genome.title}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">{genome.description}</p>
        <div className="mt-7 space-y-5">
          <label className="block text-sm">
            {t('missions.new.titleLabel')}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={genome.title}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-white/5 p-3"
            />
          </label>
          <label className="block text-sm">
            {t('missions.new.modeLabel')}
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as ExecutionMode)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] p-3"
            >
              {genome.executionModes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            {t('missions.new.experienceLabel')}
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as ExperienceLevel)}
              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] p-3"
            >
              {EXPERIENCE_LEVELS.map((item) => (
                <option key={item} value={item}>{t(`missions.new.level.${item}`)}</option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        <button
          disabled={busy}
          onClick={() => void create()}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-3 font-semibold text-white"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('missions.new.create')}
        </button>
      </section>
    </main>
  );
}
