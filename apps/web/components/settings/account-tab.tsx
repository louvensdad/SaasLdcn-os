'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { PageError } from '@/components/feedback/error-system';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsMetricCard } from '@/components/settings/settings-metric-card';
import { SettingsDangerZone } from '@/components/settings/settings-danger-zone';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';

export function AccountTab() {
  const router = useRouter();
  const { t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [busy, setBusy] = useState<'export' | 'logout' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.full_name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<unknown>(null);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<unknown>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const name = user?.full_name?.trim() || user?.email || '—';
  const initials = name.replace(/[^a-zA-Z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';

  async function saveName() {
    if (!nameDraft.trim()) return;
    setNameSaving(true);
    setNameError(null);
    try {
      const updated = await apiClient.updateCurrentUser({ full_name: nameDraft.trim() });
      setUser(updated);
      setEditingName(false);
    } catch (caught) {
      setNameError(caught);
    } finally {
      setNameSaving(false);
    }
  }

  async function submitPasswordChange() {
    if (!currentPassword || newPassword.length < 8) return;
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(false);
    try {
      await apiClient.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordSuccess(true);
      setPasswordOpen(false);
    } catch (caught) {
      setPasswordError(caught);
    } finally {
      setPasswordSaving(false);
    }
  }

  async function exportData() {
    setBusy('export');
    setError(null);
    try {
      const payload = await apiClient.exportMyData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ldcn-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  // DeleteResourceButton owns its own pending/error state and displays any
  // rejection inline in its confirmation dialog -- let it propagate rather
  // than swallowing it here.
  async function deleteAccount() {
    await apiClient.deleteAccount();
    clearSession();
    router.replace('/login');
  }

  async function signOut() {
    setBusy('logout');
    setError(null);
    try {
      await logout();
      router.replace('/login');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <SettingsSection title={t('settings.account.profileTitle')} description={t('settings.account.profileDescription')} surface="primary">
        <div className="flex flex-wrap items-center gap-4">
          <span
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-xl font-bold"
            style={{ background: 'var(--accent-gradient)', color: 'var(--control-selected-text)' }}
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            {editingName ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  aria-label={t('settings.account.editName')}
                  className="max-w-xs"
                  error={Boolean(nameError)}
                />
                <Button variant="primary" loading={nameSaving} disabled={!nameDraft.trim()} onClick={() => void saveName()}>
                  {t('settings.account.save')}
                </Button>
                <Button variant="ghost" disabled={nameSaving} onClick={() => { setEditingName(false); setNameDraft(user?.full_name ?? ''); setNameError(null); }}>
                  {t('settings.account.cancel')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="ds-section text-[color:var(--text)]">{name}</h2>
                <Button variant="ghost" onClick={() => setEditingName(true)}>{t('settings.account.editName')}</Button>
              </div>
            )}
            <p className="mt-1 t-mono text-sm text-[color:var(--muted)]">{user?.email ?? '—'}</p>
            {nameError ? <p className="mt-1 ds-caption text-[color:var(--danger)]" role="alert">{getApiErrorMessage(nameError, t('settings.account.editNameError'))}</p> : null}
          </div>
          <Badge tone="accent" className="ml-auto capitalize">{user?.role ?? '—'}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsMetricCard label={t('settings.privacy.consent')} value={user?.consent_policy_version ?? t('settings.privacy.notRecorded')} />
          <label className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_40%,transparent)] p-3">
            <span className="ds-caption">{t('settings.interfaceLanguage')}</span>
            <LocaleSelector />
          </label>
        </div>

        <Button variant="secondary" loading={busy === 'export'} onClick={() => void exportData()} disabled={busy !== null}>
          {t('settings.privacy.export')}
        </Button>

        {error ? (
          <PageError title={t('settings.privacy.error')} description={getApiErrorMessage(error, t('settings.privacy.errorDescription'))} className="p-4" />
        ) : null}
      </SettingsSection>

      <SettingsSection title={t('settings.account.securityTitle')} description={t('settings.account.securityDescription')}>
        {passwordOpen ? (
          <div className="grid max-w-sm gap-3">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t('settings.account.currentPassword')}
              aria-label={t('settings.account.currentPassword')}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              error={Boolean(passwordError)}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={t('settings.account.newPassword')}
              aria-label={t('settings.account.newPassword')}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              error={Boolean(passwordError)}
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                loading={passwordSaving}
                disabled={!currentPassword || newPassword.length < 8}
                onClick={() => void submitPasswordChange()}
              >
                {t('settings.account.savePassword')}
              </Button>
              <Button variant="ghost" disabled={passwordSaving} onClick={() => { setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setPasswordError(null); }}>
                {t('settings.account.cancel')}
              </Button>
            </div>
            {passwordError ? <p className="ds-caption text-[color:var(--danger)]" role="alert">{getApiErrorMessage(passwordError, t('settings.account.changePasswordError'))}</p> : null}
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>{t('settings.account.changePassword')}</Button>
        )}
        {passwordSuccess ? <p className="ds-caption text-[color:var(--success)]" role="status">{t('settings.account.changePasswordSuccess')}</p> : null}
      </SettingsSection>

      <SettingsDangerZone title={t('settings.account.dangerTitle')} description={t('settings.account.dangerDescription')}>
        <Button variant="ghost" onClick={() => void signOut()} disabled={busy !== null} loading={busy === 'logout'}>
          {t('settings.privacy.logout')}
        </Button>
        <DeleteResourceButton
          title={t('settings.account.deleteTitle')}
          description={t('settings.account.deleteDescription')}
          triggerLabel={t('settings.privacy.delete')}
          onConfirm={deleteAccount}
        />
      </SettingsDangerZone>
    </div>
  );
}
