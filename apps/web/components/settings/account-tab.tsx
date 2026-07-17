'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ChevronRight, Download, History, LogOut, PowerOff, ShieldAlert, ShieldCheck, Smartphone, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { IconButton } from '@/components/ui/icon-button';
import { DeleteResourceButton } from '@/components/ui/delete-resource-button';
import { PageError } from '@/components/feedback/error-system';
import { LocaleSelector } from '@/components/shell/locale-selector';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsDangerZone } from '@/components/settings/settings-danger-zone';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { ManageSessionsDialog } from '@/components/settings/manage-sessions-dialog';
import { TwoFactorDialog } from '@/components/settings/two-factor-dialog';
import { WorkspaceMembersDialog } from '@/components/settings/workspace-members-dialog';
import { apiClient } from '@/lib/api/client';
import { getApiErrorMessage } from '@/lib/api/errors';
import { readImageAsAvatarDataUrl } from '@/lib/image/avatar';
import { useLocale } from '@/hooks/use-locale';
import { useAuthStore } from '@/stores/use-auth-store';
import { TIMEZONE_OPTIONS, usePersonalPreferencesStore, type DateFormat, type TimeFormat } from '@/stores/use-personal-preferences-store';
import type { SessionResponse, Workspace } from '@/lib/api/types';

export function AccountTab() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const preferences = usePersonalPreferencesStore();
  const [busy, setBusy] = useState<'export' | 'activity' | 'logout' | 'consent' | 'deactivate' | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<unknown>(null);

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

  // Real session + workspace context, loaded once for the security/workspace cards.
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [twoFactorMode, setTwoFactorMode] = useState<'enroll' | 'disable' | null>(null);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [consentConfirmOpen, setConsentConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);

  const name = user?.full_name?.trim() || user?.email || '—';
  const initials = name.replace(/[^a-zA-Z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';

  const accountRoleLabel = user?.role === 'admin' ? t('settings.account.roleAdmin') : t('settings.account.roleUser');
  // "Fundador · Administrador" in the reference: workspace owners are shown as
  // founders, then their account-level role.
  const roleLineText = workspace?.role === 'owner'
    ? `${t('settings.account.founder')} · ${accountRoleLabel}`
    : accountRoleLabel;

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await apiClient.listSessions());
    } catch {
      // Non-fatal: the security card degrades to "no data" rather than erroring the page.
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    let cancelled = false;
    apiClient.getAvatar()
      .then((res) => { if (!cancelled) setAvatarUrl(res.avatar_url); })
      .catch(() => { /* avatar is optional; fall back to initials */ });
    return () => { cancelled = true; };
  }, []);

  async function onPickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const dataUrl = await readImageAsAvatarDataUrl(file);
      const res = await apiClient.updateAvatar({ avatar_url: dataUrl });
      setAvatarUrl(res.avatar_url);
    } catch (caught) {
      setAvatarError(caught);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      await apiClient.updateAvatar({ avatar_url: null });
      setAvatarUrl(null);
    } catch (caught) {
      setAvatarError(caught);
    } finally {
      setAvatarBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await apiClient.getDefaultWorkspace();
        if (cancelled) return;
        setWorkspace(ws);
        try {
          const members = await apiClient.listWorkspaceMembers(ws.workspace_id);
          if (!cancelled) setMemberCount(members.length);
        } catch {
          // Member list is best-effort; the card still shows the workspace name/role.
        }
      } catch {
        // No workspace context available -> the Workspace card simply doesn't render.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const latestSession = sessions[0] ?? null;

  function formatDateTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

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

  function downloadJson(payload: unknown, prefix: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportData() {
    setBusy('export');
    setError(null);
    try {
      downloadJson(await apiClient.exportMyData(), 'ldcn-personal-data');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function exportActivity() {
    setBusy('activity');
    setError(null);
    try {
      downloadJson(await apiClient.exportMyActivity(), 'ldcn-activity-history');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function revokeConsent() {
    setBusy('consent');
    setError(null);
    try {
      const updated = await apiClient.revokeConsent();
      setUser(updated);
      setConsentConfirmOpen(false);
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

  // Danger-zone "sign out of all devices": revoke every session server-side,
  // then clear the local session and return to login.
  async function signOut() {
    setBusy('logout');
    setError(null);
    try {
      await apiClient.logoutAllDevices();
      clearSession();
      router.replace('/login');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  async function deactivate() {
    await apiClient.deactivateAccount();
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="space-y-5">
      <Card surface="primary" className="space-y-5 rounded-[1.5rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- inline data URL, not a remote asset to optimize
                <img src={avatarUrl} alt={name} className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <span
                  className="grid h-20 w-20 place-items-center rounded-full text-2xl font-bold"
                  style={{ background: 'var(--accent-gradient)', color: 'var(--control-selected-text)' }}
                  aria-hidden
                >
                  {initials}
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => void onPickAvatar(event)}
              />
              <button
                type="button"
                disabled={avatarBusy}
                aria-label={t('settings.account.changePhoto')}
                title={t('settings.account.changePhoto')}
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: 'var(--surface)', borderColor: 'var(--surface-2)', color: 'var(--muted)' }}
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
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
                  <Badge tone="accent">{t('settings.account.userBadge')}</Badge>
                </div>
              )}
              <p className="mt-1 t-mono text-sm text-[color:var(--muted)]">{user?.email ?? '—'}</p>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{roleLineText}</p>
              {workspace ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]">
                    <Users className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                  </span>
                  <div className="min-w-0">
                    <p className="ds-caption">{t('settings.workspace.current')}</p>
                    <p className="truncate text-sm font-semibold text-[color:var(--text)]">{workspace.name}</p>
                  </div>
                </div>
              ) : null}
              {avatarError ? <p className="mt-1 ds-caption text-[color:var(--danger)]" role="alert">{getApiErrorMessage(avatarError, t('settings.account.changePhotoError'))}</p> : null}
              {avatarUrl ? (
                <button type="button" onClick={() => void removeAvatar()} disabled={avatarBusy} className="mt-1 text-xs text-[color:var(--muted)] underline-offset-2 hover:underline disabled:opacity-50">
                  {t('settings.account.removePhoto')}
                </button>
              ) : null}
              {nameError ? <p className="mt-1 ds-caption text-[color:var(--danger)]" role="alert">{getApiErrorMessage(nameError, t('settings.account.editNameError'))}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 text-right sm:grid-cols-1">
            <div>
              <p className="ds-caption">{t('settings.account.accountStatus')}</p>
              <Badge tone="success" className="mt-1">{t('settings.account.accountActive')}</Badge>
            </div>
            <div>
              <p className="ds-caption">{t('settings.privacy.consent')}</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">{user?.consent_policy_version ?? t('settings.privacy.notRecorded')}</p>
            </div>
            <div>
              <p className="ds-caption">{t('settings.account.memberSince')}</p>
              <p className="text-sm font-semibold text-[color:var(--text)]">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setEditingName(true)} className="justify-self-end">
              {t('settings.account.editProfile')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <SettingsSection title={t('settings.account.preferencesTitle')} className="rounded-[1.5rem]">
          <div className="space-y-3">
            <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]">
              <span>{t('settings.interfaceLanguage')}</span>
              <LocaleSelector />
            </label>
            <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]">
              <span>{t('settings.account.timezone')}</span>
              <Select value={preferences.timezone} onChange={(event) => preferences.setTimezone(event.target.value)}>
                {TIMEZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]">
              <span>{t('settings.account.dateFormat')}</span>
              <Select value={preferences.dateFormat} onChange={(event) => preferences.setDateFormat(event.target.value as DateFormat)}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]">
              <span>{t('settings.account.timeFormat')}</span>
              <Select value={preferences.timeFormat} onChange={(event) => preferences.setTimeFormat(event.target.value as TimeFormat)}>
                <option value="24h">{t('settings.account.timeFormat24')}</option>
                <option value="12h">{t('settings.account.timeFormat12')}</option>
              </Select>
            </label>
            <div className="space-y-3 border-t border-[color:var(--border)] pt-3">
              <SettingsToggleRow
                label={t('settings.account.emailNotifications')}
                description={t('settings.account.emailNotificationsHint')}
                checked={preferences.emailNotifications}
                onChange={preferences.setEmailNotifications}
              />
              <SettingsToggleRow
                label={t('settings.account.weeklySummary')}
                description={t('settings.account.weeklySummaryHint')}
                checked={preferences.weeklySummary}
                onChange={preferences.setWeeklySummary}
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.account.securityTitle')} className="rounded-[1.5rem]">
          <div className="space-y-4">
            <dl className="space-y-3">
              <div>
                <dt className="ds-caption">{t('settings.account.lastLogin')}</dt>
                <dd className="text-sm font-semibold text-[color:var(--text)]">
                  {latestSession ? formatDateTime(latestSession.created_at) : t('settings.account.noSessionData')}
                </dd>
              </div>
              <div>
                <dt className="ds-caption">{t('settings.account.device')}</dt>
                <dd className="text-sm font-semibold text-[color:var(--text)]">
                  {latestSession?.device_label ?? t('settings.account.unknownDevice')}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <dt className="ds-caption">{t('settings.account.ipAddress')}</dt>
                  <dd className="t-mono text-sm font-semibold text-[color:var(--text)]">{latestSession?.ip_address ?? '—'}</dd>
                </div>
                {latestSession ? <Badge tone="success">{t('settings.account.active')}</Badge> : null}
              </div>
            </dl>

            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.account.twoFactor')}</p>
                  <p className="ds-caption">{t('settings.account.twoFactorHint')}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={user?.is_2fa_enabled ? 'success' : 'neutral'}>
                  {user?.is_2fa_enabled ? t('settings.account.enabled') : t('settings.account.disabled')}
                </Badge>
                <Button
                  variant="ghost"
                  className="h-auto p-0 text-xs text-[color:var(--accent)]"
                  onClick={() => setTwoFactorMode(user?.is_2fa_enabled ? 'disable' : 'enroll')}
                >
                  {user?.is_2fa_enabled ? t('settings.account.twoFactorDisableAction') : t('settings.account.twoFactorEnableAction')}
                </Button>
              </div>
            </div>

            <div className="border-t border-[color:var(--border)] pt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-[color:var(--muted)]" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.account.activeSessions')}</p>
                    <p className="ds-caption">{t('settings.account.activeSessionsCount', { count: String(sessions.length) })}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="secondary" onClick={() => setSessionsDialogOpen(true)}>
                  {t('settings.account.manageSessions')}
                </Button>
              </div>
            </div>

            {passwordOpen ? (
              <div className="grid gap-3 border-t border-[color:var(--border)] pt-3">
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
              <Button variant="primary" className="w-full" onClick={() => setPasswordOpen(true)}>{t('settings.account.changePassword')}</Button>
            )}
            {passwordSuccess ? <p className="ds-caption text-[color:var(--success)]" role="status">{t('settings.account.changePasswordSuccess')}</p> : null}
          </div>
        </SettingsSection>

        <div className="space-y-4">
          <SettingsSection title={t('settings.account.dataManagementTitle')} className="rounded-[1.5rem]">
            <div className="space-y-2">
              <DataRow
                title={t('settings.privacy.export')}
                description={t('settings.account.exportDescription')}
                icon={<Download className="h-4 w-4" />}
                onClick={() => void exportData()}
                loading={busy === 'export'}
                disabled={busy !== null}
              />
              <DataRow
                title={t('settings.account.activityExport')}
                description={t('settings.account.activityExportDescription')}
                icon={<History className="h-4 w-4" />}
                onClick={() => void exportActivity()}
                loading={busy === 'activity'}
                disabled={busy !== null}
              />
              <DataRow
                title={t('settings.account.revokeConsent')}
                description={t('settings.account.revokeConsentDescription')}
                icon={<ChevronRight className="h-4 w-4" />}
                iconVariant="ghost"
                onClick={() => setConsentConfirmOpen(true)}
                disabled={busy !== null || !user?.consent_accepted_at}
              />
            </div>
            {error ? (
              <PageError title={t('settings.privacy.error')} description={getApiErrorMessage(error, t('settings.privacy.errorDescription'))} className="mt-3 p-4" />
            ) : null}
          </SettingsSection>

          {workspace ? (
            <SettingsSection title={t('settings.workspace.title')} className="rounded-[1.5rem]">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="ds-caption">{t('settings.workspace.current')}</p>
                    <p className="truncate text-sm font-semibold text-[color:var(--text)]">{workspace.name}</p>
                  </div>
                  <Badge tone="accent">{t(`settings.workspace.role.${workspace.role}`)}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="ds-caption">{t('settings.workspace.members')}</p>
                  <p className="text-sm font-semibold text-[color:var(--text)]">
                    {memberCount === null ? '—' : t('settings.workspace.memberCount', { count: String(memberCount) })}
                  </p>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setMembersDialogOpen(true)}>
                  {t('settings.workspace.manage')}
                </Button>
              </div>
            </SettingsSection>
          ) : null}
        </div>
      </div>

      <SettingsDangerZone title={t('settings.account.dangerTitle')} description={t('settings.account.dangerDescription')}>
        <div className="w-full divide-y divide-[color-mix(in_srgb,var(--danger)_16%,transparent)]">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <LogOut className="h-4 w-4 shrink-0 text-[color:var(--danger)]" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.account.logoutTitle')}</p>
                <p className="ds-caption">{t('settings.account.logoutDescription')}</p>
              </div>
            </div>
            <Button variant="danger" onClick={() => void signOut()} disabled={busy !== null} loading={busy === 'logout'}>
              <LogOut className="h-4 w-4" />
              {t('settings.privacy.logout')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <PowerOff className="h-4 w-4 shrink-0 text-[color:var(--danger)]" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.account.deactivateTitle')}</p>
                <p className="ds-caption">{t('settings.account.deactivateDescription')}</p>
              </div>
            </div>
            <Button variant="danger" onClick={() => setDeactivateConfirmOpen(true)} disabled={busy !== null} loading={busy === 'deactivate'}>
              <PowerOff className="h-4 w-4" />
              {t('settings.account.deactivateAction')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <Trash2 className="h-4 w-4 shrink-0 text-[color:var(--danger)]" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('settings.account.deleteTitle')}</p>
                <p className="ds-caption">{t('settings.account.deleteDescription')}</p>
              </div>
            </div>
            <DeleteResourceButton
              title={t('settings.account.deleteTitle')}
              description={t('settings.account.deleteDescription')}
              triggerLabel={t('settings.privacy.delete')}
              onConfirm={deleteAccount}
            />
          </div>
        </div>
      </SettingsDangerZone>

      <ManageSessionsDialog open={sessionsDialogOpen} onClose={() => setSessionsDialogOpen(false)} onChanged={() => void loadSessions()} />
      <TwoFactorDialog open={twoFactorMode !== null} mode={twoFactorMode ?? 'enroll'} onClose={() => setTwoFactorMode(null)} />
      <WorkspaceMembersDialog open={membersDialogOpen} onClose={() => setMembersDialogOpen(false)} workspaceId={workspace?.workspace_id ?? null} workspaceName={workspace?.name ?? ''} />

      <ConsentRevokeConfirm
        open={consentConfirmOpen}
        onClose={() => setConsentConfirmOpen(false)}
        onConfirm={() => void revokeConsent()}
        busy={busy === 'consent'}
      />

      <Modal
        open={deactivateConfirmOpen}
        onClose={() => setDeactivateConfirmOpen(false)}
        title={t('settings.account.deactivateTitle')}
        description={t('settings.account.deactivateConfirm')}
        icon={<PowerOff className="h-5 w-5 text-[color:var(--danger)]" />}
        busy={busy === 'deactivate'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivateConfirmOpen(false)} disabled={busy === 'deactivate'}>{t('settings.account.cancel')}</Button>
            <Button variant="danger" loading={busy === 'deactivate'} onClick={() => { setBusy('deactivate'); void deactivate().catch((caught) => { setError(caught); setBusy(null); }); }}>
              {t('settings.account.deactivateAction')}
            </Button>
          </>
        }
      >
        <p className="ds-caption">{t('settings.account.deactivateDetail')}</p>
      </Modal>
    </div>
  );
}

interface DataRowProps {
  readonly title: string;
  readonly description: string;
  readonly icon: ReactNode;
  readonly iconVariant?: 'secondary' | 'ghost';
  readonly onClick: () => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
}

function DataRow({ title, description, icon, iconVariant = 'secondary', onClick, loading, disabled }: DataRowProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
          <p className="ds-caption">{description}</p>
        </div>
        <IconButton variant={iconVariant} loading={loading} onClick={onClick} disabled={disabled} aria-label={title}>
          {icon}
        </IconButton>
      </div>
    </div>
  );
}

interface ConsentRevokeConfirmProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly busy: boolean;
}

function ConsentRevokeConfirm({ open, onClose, onConfirm, busy }: ConsentRevokeConfirmProps) {
  const { t } = useLocale();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.account.revokeConsent')}
      description={t('settings.account.revokeConsentConfirm')}
      icon={<ShieldAlert className="h-5 w-5 text-[color:var(--danger)]" />}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t('settings.account.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>{t('settings.account.revokeConsentAction')}</Button>
        </>
      }
    >
      <p className="ds-caption">{t('settings.account.revokeConsentDetail')}</p>
    </Modal>
  );
}
