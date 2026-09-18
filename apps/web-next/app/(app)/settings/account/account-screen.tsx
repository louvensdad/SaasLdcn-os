'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Notice, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useSession } from '@/lib/session/session';

export function AccountScreen() {
  const { t, locale } = useI18n();
  const { state } = useSession();
  const queryClient = useQueryClient();
  const user = state.status === 'signed-in' ? state.user : null;
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [code, setCode] = useState('');

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, retry: false });
  const save = useMutation({ mutationFn: () => api.updateProfile({ full_name: fullName.trim() }) });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => api.revokeSession(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const enroll = useMutation({ mutationFn: () => api.enroll2fa() });
  const verify = useMutation({ mutationFn: () => api.verify2fa(code.trim()), onSuccess: () => setCode('') });
  const exportData = useMutation({
    mutationFn: () => api.exportAccount(),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ldcn-account-export.json';
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.account.title')}</h1>
          <p className="lede">{t('settings.account.lede')}</p>
        </div>
      </div>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('settings.account.profile.title')}</h2></div>
          <div className="stack">
            <label className="field">
              <span className="field-label">{t('settings.account.profile.name')}</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </label>
            <Kv
              pairs={[
                [t('settings.account.profile.email'), <span key="e" className="mono">{user?.email ?? '—'}</span>],
                [t('settings.account.profile.role'), <span key="r" className="mono">{user?.role ?? '—'}</span>],
                [t('settings.account.profile.since'), user ? formatWhen(user.created_at, locale) : '—'],
                [t('settings.account.profile.consent'), user?.consent_policy_version
                  ? `${user.consent_policy_version} · ${formatWhen(user.consent_accepted_at ?? null, locale)}`
                  : t('common.notYet')],
              ]}
            />
            <div className="btn-row">
              <button className="btn btn-primary" type="button" disabled={save.isPending || !fullName.trim()} onClick={() => save.mutate()}>
                {save.isPending ? t('settings.account.profile.saving') : t('settings.account.profile.save')}
              </button>
            </div>
            {save.isSuccess ? <Notice family="proof" title={t('settings.account.profile.saved')} /> : null}
            <Source>GET · PATCH /api/auth/me</Source>
          </div>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.account.twofa.title')}</h2>
            <Badge value={user?.is_2fa_enabled ? 'ENABLED' : 'DISABLED'} family={user?.is_2fa_enabled ? 'proof' : 'idle'} />
          </div>
          <div className="stack">
            <p className="body ink2">{t('settings.account.twofa.body')}</p>
            <Notice family="caution" title={t('settings.account.twofa.gapTitle')}>{t('settings.account.twofa.gapBody')}</Notice>
            <div className="btn-row">
              <button className="btn btn-ghost" type="button" disabled={enroll.isPending} onClick={() => enroll.mutate()}>
                {t('settings.account.twofa.enroll')}
              </button>
            </div>
            {enroll.data ? (
              <>
                <Kv pairs={[[t('settings.account.twofa.secret'), <span key="s" className="mono">{enroll.data.secret}</span>]]} />
                <label className="field">
                  <span className="field-label">{t('settings.account.twofa.code')}</span>
                  <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" />
                </label>
                <div className="btn-row">
                  <button className="btn btn-hand" type="button" disabled={verify.isPending || code.trim().length < 6} onClick={() => verify.mutate()}>
                    {t('settings.account.twofa.verify')}
                  </button>
                </div>
              </>
            ) : null}
            <Source>POST /api/auth/me/2fa/enroll · POST …/verify</Source>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('settings.account.sessions.title')}</h2>
          <span className="meta">{t('settings.account.sessions.meta', { count: sessions.data?.length ?? 0 })}</span>
          <div className="actions">
            <button className="btn btn-quiet btn-sm" type="button" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>
              {t('settings.account.sessions.revokeOthers')}
            </button>
          </div>
        </div>
        {sessions.isPending ? <Skeleton lines={3} /> : null}
        {sessions.data && sessions.data.length > 0 ? (
          <div className="list">
            {sessions.data.map((session) => (
              <div className="li" key={session.session_id}>
                <Signal family={session.is_current ? 'pulse' : 'idle'} label={session.device_label ?? session.session_id} />
                <span className="li-title">{session.device_label ?? t('settings.account.sessions.unknownDevice')}</span>
                <span className="meta">
                  {session.is_current ? <Badge value="CURRENT" family="proof" /> : (
                    <button className="btn btn-quiet btn-sm" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(session.session_id)}>
                      {t('settings.account.sessions.revoke')}
                    </button>
                  )}
                </span>
                <span className="li-sub mono">
                  {session.ip_address ?? '—'} · {formatWhen(session.last_seen_at, locale)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <Source>GET /api/auth/me/sessions · DELETE …/{'{'}session_id{'}'}</Source>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('settings.account.data.title')}</h2></div>
        <div className="btn-row">
          <button className="btn btn-ghost" type="button" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
            {exportData.isPending ? t('settings.account.data.exporting') : t('settings.account.data.export')}
          </button>
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('settings.account.data.note')}</p>
        <Source>GET /api/auth/me/export</Source>
      </section>
    </>
  );
}
