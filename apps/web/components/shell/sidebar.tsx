'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LogOut, PanelLeftClose, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { aiKeyVaultClient } from '@/lib/api/ai-key-vault';
import { apiClient } from '@/lib/api/client';
import { billingCatalogClient } from '@/lib/api/billing-catalog';
import { cn } from '@/lib/cn';
import { NAVIGATION_ITEMS } from '@/lib/navigation';
import { useLocale } from '@/hooks/use-locale';
import { useMarketplaceUpdatesCount } from '@/hooks/use-marketplace-updates-count';
import { useShellStore } from '@/stores/use-shell-store';
import { useAuthStore } from '@/stores/use-auth-store';

function formatGb(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

interface SidebarProps {
  readonly compact?: boolean;
}

export function Sidebar({ compact = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const sidebarOpen = useShellStore((state) => state.sidebarOpen);
  const setSidebarOpen = useShellStore((state) => state.setSidebarOpen);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const name = user?.full_name?.trim() || user?.email || '—';
  const initials = name.replace(/[^a-zA-Z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'U';

  const marketplaceUpdatesCount = useMarketplaceUpdatesCount();

  const { data: subscription } = useQuery({
    queryKey: ['billing', 'subscription'], queryFn: () => billingCatalogClient.subscription(), staleTime: 60_000,
  });
  const { data: plans } = useQuery({
    queryKey: ['billing', 'plans'], queryFn: billingCatalogClient.plans, staleTime: 5 * 60_000,
  });
  const { data: aiKeys } = useQuery({
    queryKey: ['user-ai-keys'], queryFn: () => aiKeyVaultClient.list(), staleTime: 60_000,
  });
  // Defensive against a malformed/unexpected response shape (e.g. a test's
  // generic catch-all mock, or a real backend error surfaced as something
  // other than the typed contract) -- this is a global shell component
  // rendered on every authenticated page, so it must never throw and take
  // the whole page down with it.
  const planList = Array.isArray(plans) ? plans : [];
  const keyList = Array.isArray(aiKeys?.keys) ? aiKeys.keys : [];
  const activePlan = planList.find((plan) => plan.code === subscription?.plan_code);
  const planName = activePlan?.name ?? null;
  const storageQuota = formatGb(activePlan?.limits.storage_bytes ?? null);
  const connectedProvidersCount = new Set(keyList.filter((key) => key.ativo).map((key) => key.provider)).size;

  // Same avatar the Account tab shows (Settings) -- kept in sync so the
  // sidebar never shows a stale "no photo" fallback once one is uploaded.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiClient.getAvatar()
      .then((res) => { if (!cancelled) setAvatarUrl(res.avatar_url); })
      .catch(() => { /* avatar is optional; fall back to initials */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.aside
      initial={false}
      animate={{
        opacity: compact && !sidebarOpen ? 0.98 : 1,
      }}
      transition={{ type: 'spring', stiffness: 170, damping: 22 }}
      // LDCN OS product identity -- always navy, in both Light and Dark
      // content themes (--sidebar-* tokens are non-themed, see globals.css).
      style={{
        background: 'linear-gradient(180deg, var(--sidebar-bg) 0%, var(--sidebar-bg-2) 100%)',
        borderColor: 'var(--sidebar-border)',
      }}
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden border-y-0 border-l-0 border-r p-3 will-change-transform',
        compact
          ? sidebarOpen
            ? 'translate-x-0'
            : '-translate-x-[calc(100%+1.25rem)]'
          : 'translate-x-0',
        'xl:translate-x-0 xl:opacity-100',
      )}
    >
      <span className="instrument-rail" aria-hidden />

      <div className="relative flex items-center justify-between gap-3 border-b px-2 pb-4 pt-1" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border"
            style={{ borderColor: 'var(--sidebar-border)', background: 'rgba(255,255,255,0.04)' }}
          >
            <img
              src="/ldcn-logo.png"
              alt={t('product.name')}
              className="h-8 w-8 object-contain"
            />
          </div>
          <div>
            <p className="type-data text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--sidebar-text-muted)' }}>
              {t('product.name')}
            </p>
            <p className="ds-subsection leading-tight" style={{ color: 'var(--sidebar-text)' }}>
              {t('sidebar.foundation')}
            </p>
          </div>
        </div>

        {compact ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 rounded-[var(--radius-md)] p-0 xl:hidden"
            style={{ color: 'var(--sidebar-text)' }}
            onClick={() => setSidebarOpen(false)}
            aria-label={t('sidebar.close')}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <Badge
        className="mx-2 mb-3 mt-4 w-fit rounded-[var(--radius-sm)] border bg-transparent font-mono"
        style={{ borderColor: 'color-mix(in srgb, var(--sidebar-accent) 45%, transparent)', color: 'var(--sidebar-accent)' }}
      >
        {t('sidebar.badge')}
      </Badge>

      <Separator className="mb-3 bg-[color:var(--sidebar-border)]" />

      <nav className="flex-1 space-y-1 overflow-y-auto px-1 pr-2" aria-label={t('sidebar.foundation')}>
        {NAVIGATION_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className="group micro-interaction relative flex min-h-12 items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border px-2.5 py-2 focus-ring"
              style={
                active
                  ? { borderColor: 'color-mix(in srgb, var(--sidebar-accent) 55%, transparent)', background: 'var(--sidebar-hover)' }
                  : { borderColor: 'transparent', background: 'transparent' }
              }
              onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              }}
              onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = 'transparent';
              }}
            >
              {active ? (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  className="absolute inset-y-2 left-0 w-0.5"
                  style={{ background: 'var(--sidebar-accent)' }}
                  transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                />
              ) : null}
              <span
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border transition duration-200"
                style={
                  active
                    ? { borderColor: 'color-mix(in srgb, var(--sidebar-accent) 60%, transparent)', background: 'rgba(124,58,237,0.16)', color: 'var(--sidebar-accent)' }
                    : { borderColor: 'var(--sidebar-border)', background: 'rgba(255,255,255,0.03)', color: 'var(--sidebar-text-muted)' }
                }
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="block truncate text-sm font-semibold leading-5" style={{ color: 'var(--sidebar-text)' }}>
                    {t(item.labelKey)}
                  </span>
                  {item.badgeCountKey === 'marketplaceUpdates' && marketplaceUpdatesCount > 0 ? (
                    <Badge
                      tone="accent"
                      className="ds-badge shrink-0 px-1.5 py-0"
                      aria-label={t('navigation.marketplace.updatesBadge', { count: marketplaceUpdatesCount })}
                    >
                      {marketplaceUpdatesCount}
                    </Badge>
                  ) : null}
                </span>
                {active ? (
                  <span className="mt-0.5 block text-xs leading-4" style={{ color: 'var(--sidebar-text-muted)' }}>
                    {t(item.descriptionKey)}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-1 mt-3 rounded-[var(--radius-md)] border p-3" style={{ borderColor: 'var(--sidebar-border)', background: 'rgba(255,255,255,0.03)' }}>
        <div className="ds-caption mb-2 flex items-center gap-2" style={{ color: 'var(--sidebar-text-muted)' }}>
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          {t('sidebar.rules')}
        </div>
        <p className="text-sm leading-6" style={{ color: 'var(--sidebar-text)', opacity: 0.85 }}>
          {t('sidebar.rulesDescription')}
        </p>
      </div>

      {planName ? (
        <div className="mx-1 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] border px-3 py-2 text-xs" style={{ borderColor: 'var(--sidebar-border)', color: 'var(--sidebar-text-muted)' }}>
          <Badge tone="accent" className="ds-badge px-2 py-0.5">{t('sidebar.plan', { plan: planName })}</Badge>
          {connectedProvidersCount > 0 ? <span>{t('sidebar.connectedProviders', { count: connectedProvidersCount })}</span> : null}
          {storageQuota ? <span>{t('sidebar.storageQuota', { quota: storageQuota })}</span> : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] border p-2" style={{ borderColor: 'var(--sidebar-border)' }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- inline data URL, not a remote asset to optimize
          <img src={avatarUrl} alt={name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold"
            style={{ background: 'var(--accent-gradient)', color: 'var(--control-selected-text)' }}
            aria-hidden
          >
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-5" style={{ color: 'var(--sidebar-text)' }}>{name}</p>
          <p className="truncate text-xs leading-4" style={{ color: 'var(--sidebar-text-muted)' }}>{user?.email ?? ''}</p>
        </div>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="border border-[color:var(--sidebar-border)] bg-[rgba(255,255,255,0.06)] text-[color:var(--sidebar-text)] hover:border-[color:var(--sidebar-accent)] hover:bg-[rgba(124,58,237,0.18)] hover:text-[color:var(--sidebar-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sidebar-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--sidebar-bg)]"
          onClick={() => router.push('/settings')}
          aria-label={t('common.settings')}
          title={t('common.settings')}
        >
          <SettingsIcon className="h-5 w-5 text-cyan-300 transition-colors hover:text-cyan-200" strokeWidth={2.25} aria-hidden />
        </IconButton>
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          className="border border-[color:var(--sidebar-border)] bg-[rgba(255,255,255,0.06)] text-[color:var(--sidebar-text)] hover:border-[color:var(--sidebar-accent)] hover:bg-[rgba(124,58,237,0.18)] hover:text-[color:var(--sidebar-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sidebar-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--sidebar-bg)]"
          onClick={() => void logout()}
          aria-label={t('settings.privacy.logout')}
          title={t('settings.privacy.logout')}
        >
          <LogOut className="h-5 w-5 text-violet-300 transition-colors hover:text-violet-200" strokeWidth={2.25} aria-hidden />
        </IconButton>
      </div>
    </motion.aside>
  );
}
