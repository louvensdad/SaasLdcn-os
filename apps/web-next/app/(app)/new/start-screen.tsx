'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Icon, Signal } from '@/components/signal';
import { Failure, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { roomTitleFrom } from '@/lib/work/room-title';
import { currentAppUrl } from '@/lib/routes';
import type { ExecutionProfileId } from '@contracts/execution-profile.contract';
import type { DeliveryType, PreferredLanguage } from '@contracts/project-room.contract';

/** The room's own vocabulary; the picker offers exactly what the contract accepts, nothing invented. */
const DELIVERY: readonly DeliveryType[] = ['web', 'backend', 'mobile', 'full_stack'];
const PROFILES: readonly ExecutionProfileId[] = ['economy', 'professional', 'enterprise'];
const LANGUAGES: readonly PreferredLanguage[] = ['', 'python', 'typescript', 'java', 'csharp', 'go', 'rust', 'php', 'ruby', 'kotlin'];

/** Kinds of work the backend can start that this app does not yet have a create form for. */
const ELSEWHERE = [
  { id: 'import', current: '/project-rooms/import' },
  { id: 'codebase', current: '/modernize' },
  { id: 'data', current: '/data-intelligence' },
  { id: 'automation', current: '/automations' },
  { id: 'localBuild', current: '/local-generation' },
] as const;

export function StartScreen() {
  const { t } = useI18n();
  const router = useRouter();

  const [intent, setIntent] = useState('');
  const [delivery, setDelivery] = useState<DeliveryType>('web');
  const [profile, setProfile] = useState<ExecutionProfileId>('professional');
  const [language, setLanguage] = useState<PreferredLanguage>('');
  const [missionType, setMissionType] = useState('');

  const registry = useQuery({ queryKey: ['mission-registry'], queryFn: api.missionRegistry, retry: false });

  const createRoom = useMutation({
    mutationFn: () => api.createRoom({
      /* Without a title the backend names every room "Nova Criacao com IA"; the idea's first sentence names it instead. */
      title: roomTitleFrom(intent),
      raw_intent: intent.trim(),
      delivery_type: delivery,
      execution_profile: profile,
      preferred_language: language,
    }),
    onSuccess: (room) => router.push(`/p/${encodeURIComponent(room.room_id)}/define/discovery`),
  });

  const createMission = useMutation({
    mutationFn: () => api.createMission({ mission_type: missionType, raw_intent: intent.trim() }),
    onSuccess: (mission) => router.push(`/missions/${encodeURIComponent(mission.mission_id)}`),
  });

  const missions = registry.data ?? [];
  const busy = createRoom.isPending || createMission.isPending;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.start')}</span></div>
          <h1 className="title">{t('start.title')}</h1>
          <p className="lede">{t('start.lede')}</p>
        </div>
      </div>

      {createRoom.isError ? <Failure title={t('start.room.failed')} error={createRoom.error} onRetry={() => createRoom.mutate()} /> : null}
      {createMission.isError ? <Failure title={t('start.mission.failed')} error={createMission.error} onRetry={() => createMission.mutate()} /> : null}

      <section className="panel">
        <div className="panel-head"><h2 className="h-sub">{t('start.idea.title')}</h2></div>
        <div className="panel-body stack">
          <p className="body ink2">{t('start.idea.lede')}</p>
          <label className="field">
            <span className="field-label">{t('start.idea.label')}</span>
            <textarea
              rows={4}
              value={intent}
              placeholder={t('start.idea.placeholder')}
              onChange={(event) => setIntent(event.target.value)}
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t('start.idea.delivery')}</span>
              <select value={delivery} onChange={(event) => setDelivery(event.target.value as DeliveryType)}>
                {DELIVERY.map((value) => <option key={value} value={value}>{t(`start.delivery.${value}`)}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('start.idea.language')}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as PreferredLanguage)}>
                {LANGUAGES.map((value) => (
                  <option key={value || 'auto'} value={value}>{value === '' ? t('start.language.auto') : value}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">{t('start.idea.profile')}</span>
              <select value={profile} onChange={(event) => setProfile(event.target.value as ExecutionProfileId)}>
                {PROFILES.map((value) => <option key={value} value={value}>{t(`start.profile.${value}`)}</option>)}
              </select>
            </label>
          </div>

          <div className="btn-row">
            <button
              className="btn btn-hand"
              type="button"
              disabled={busy || intent.trim().length < 12}
              onClick={() => createRoom.mutate()}
            >
              {createRoom.isPending ? t('start.idea.creating') : t('start.idea.create')}
            </button>
            {intent.trim().length < 12 ? <span className="meta">{t('start.idea.tooShort')}</span> : null}
          </div>
          <p className="meta">{t('start.idea.note')}</p>
          <Source>POST /api/project-rooms</Source>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2 className="h-sub">{t('start.mission.title')}</h2>
          <span className="meta">{t('start.mission.meta', { count: missions.length })}</span>
        </div>
        <div className="panel-body stack">
          <p className="body ink2">{t('start.mission.lede')}</p>
          {registry.isPending ? <Skeleton lines={3} /> : null}
          {registry.isError ? <p className="meta">{t('start.mission.unreadable')}</p> : null}
          <div className="list">
            {missions.map((mission) => (
              <button
                className="li li-pick"
                key={mission.id}
                type="button"
                aria-current={mission.id === missionType}
                onClick={() => setMissionType(mission.id)}
              >
                <Signal family={mission.id === missionType ? 'hand' : 'idle'} label={mission.title} />
                <span className="li-title" lang="pt-BR">{mission.title}</span>
                <span className="meta mono">{mission.category}</span>
                <span className="li-sub">{t('start.mission.specialists', { list: mission.specialists.join(' \u00b7 ') })}</span>
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button
              className="btn btn-hand"
              type="button"
              disabled={busy || !missionType}
              title={missionType ? undefined : t('start.mission.pickFirst')}
              onClick={() => createMission.mutate()}
            >
              {createMission.isPending ? t('start.mission.creating') : t('start.mission.create')}
            </button>
            {missionType ? null : <span className="meta">{t('start.mission.pickFirst')}</span>}
          </div>
          <p className="meta">{t('start.mission.note')}</p>
          <Source>GET /api/missions/registry · POST /api/missions</Source>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('start.elsewhere.title')}</h2></div>
        <p className="body ink2">{t('start.elsewhere.lede')}</p>
        <div className="list">
          {ELSEWHERE.map((entry) => (
            <div className="li" key={entry.id}>
              <Signal family="na" label={t(`start.elsewhere.${entry.id}`)} />
              <span className="li-title">{t(`start.elsewhere.${entry.id}`)}</span>
              <span className="meta">
                <a className="btn btn-quiet btn-sm" href={currentAppUrl(entry.current)}>{t('pending.open')} <Icon name="external" /></a>
              </span>
              <span className="li-sub">{t(`start.elsewhereBody.${entry.id}`)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
