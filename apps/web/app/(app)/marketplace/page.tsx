'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Archive, Download, RefreshCw, Search, ShieldCheck, Store, Tag, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageError } from '@/components/feedback/error-system';
import { SectionHeader } from '@/components/shell/section-header';
import { useLocale } from '@/hooks/use-locale';
import { automationsClient, type Automation } from '@/lib/api/automations';
import { marketplaceClient, type MarketplaceInstall, type MarketplaceItem } from '@/lib/api/marketplace';

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

export default function MarketplacePage() {
  const { t } = useLocale();

  const [catalog, setCatalog] = useState<MarketplaceItem[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  const [mine, setMine] = useState<MarketplaceItem[] | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [republishTargetId, setRepublishTargetId] = useState<string | null>(null);
  const [republishNote, setRepublishNote] = useState('');
  const [republishBusy, setRepublishBusy] = useState(false);

  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [sourceAutomationId, setSourceAutomationId] = useState('');
  const [publishName, setPublishName] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishLicense, setPublishLicense] = useState('MIT');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const [installs, setInstalls] = useState<MarketplaceInstall[] | null>(null);
  const [uninstallingId, setUninstallingId] = useState<string | null>(null);

  async function loadCatalog(query?: string) {
    try {
      setCatalog(await marketplaceClient.catalog(query || undefined));
      setCatalogError(null);
    } catch (caught) {
      setCatalogError(errorMessage(caught, t('marketplace.error.description')));
    }
  }

  async function loadMine() {
    setMine(await marketplaceClient.mine().catch(() => []));
  }

  async function loadAutomations() {
    setAutomations(await automationsClient.list().catch(() => []));
  }

  async function loadInstalls() {
    setInstalls(await marketplaceClient.myInstalls().catch(() => []));
  }

  useEffect(() => {
    void loadCatalog();
    void loadMine();
    void loadAutomations();
    void loadInstalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableAutomations = useMemo(() => (automations ?? []).filter((automation) => automation.status !== 'archived'), [automations]);

  async function handleInstall(itemId: string) {
    setInstallingId(itemId);
    try {
      await marketplaceClient.install(itemId);
      await Promise.all([loadInstalls(), loadCatalog(search)]);
    } catch (caught) {
      setCatalogError(errorMessage(caught, t('marketplace.error.description')));
    } finally {
      setInstallingId(null);
    }
  }

  async function handlePublish(event: FormEvent) {
    event.preventDefault();
    setPublishBusy(true);
    setPublishError(null);
    setPublishSuccess(false);
    try {
      await marketplaceClient.publish({
        source_automation_id: sourceAutomationId,
        name: publishName,
        description: publishDescription,
        license: publishLicense || 'Proprietary',
      });
      setPublishSuccess(true);
      setPublishName('');
      setPublishDescription('');
      setSourceAutomationId('');
      await Promise.all([loadMine(), loadCatalog(search)]);
    } catch (caught) {
      setPublishError(errorMessage(caught, t('marketplace.publish.title')));
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleArchive(itemId: string) {
    setArchivingId(itemId);
    try {
      await marketplaceClient.archive(itemId);
      await Promise.all([loadMine(), loadCatalog(search)]);
    } finally {
      setArchivingId(null);
    }
  }

  async function handleRepublish(itemId: string) {
    setRepublishBusy(true);
    try {
      await marketplaceClient.republish(itemId, republishNote);
      setRepublishTargetId(null);
      setRepublishNote('');
      await loadMine();
    } finally {
      setRepublishBusy(false);
    }
  }

  async function handleUninstall(installId: string) {
    setUninstallingId(installId);
    try {
      await marketplaceClient.uninstall(installId);
      await loadInstalls();
    } finally {
      setUninstallingId(null);
    }
  }

  const installedItemIds = useMemo(
    () => new Set((installs ?? []).filter((install) => !install.uninstalled_at).map((install) => install.item_id)),
    [installs],
  );

  return (
    <div className="space-y-8">
      <SectionHeader title={t('marketplace.title')} description={t('marketplace.description')} />

      <Card className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
            placeholder={t('marketplace.searchPlaceholder')}
            aria-label={t('marketplace.search')}
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => void loadCatalog(search)}>{t('marketplace.search')}</Button>
      </Card>

      {catalogError ? (
        <PageError title={t('marketplace.error.title')} description={catalogError} onRetry={() => void loadCatalog(search)} />
      ) : !catalog ? (
        <Card className="p-6"><p className="text-sm text-[color:var(--muted)]">{t('marketplace.empty')}</p></Card>
      ) : catalog.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Store className="h-6 w-6 text-[color:var(--muted)]" aria-hidden />
          <p className="text-sm text-[color:var(--muted)]">{t('marketplace.empty')}</p>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {catalog.map((item) => (
            <Card key={item.id} className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="ds-caption text-[color:var(--muted)]">{t('marketplace.version')} {item.version} · {t('marketplace.by')} {item.author_user_id.slice(0, 8)}</p>
                  <h3 className="mt-1 text-xl font-semibold text-[color:var(--text)]">{item.name}</h3>
                </div>
                <Badge tone="success">{t('marketplace.free')}</Badge>
              </div>
              <p className="text-sm leading-6 text-[color:var(--muted)]">{item.description}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge><Tag className="mr-1 h-3 w-3" aria-hidden />{item.license}</Badge>
                {item.permissions.map((permission) => (
                  <Badge key={permission} tone="accent"><ShieldCheck className="mr-1 h-3 w-3" aria-hidden />{permission}</Badge>
                ))}
              </div>
              <Button
                type="button"
                variant="primary"
                loading={installingId === item.id}
                disabled={installedItemIds.has(item.id)}
                onClick={() => void handleInstall(item.id)}
              >
                <Download className="h-4 w-4" aria-hidden />
                {installedItemIds.has(item.id) ? t('marketplace.installed') : t('marketplace.install')}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('marketplace.publish.title')}</h2>
          <p className="mt-1 text-sm text-[color:var(--muted)]">{t('marketplace.publish.description')}</p>
        </div>
        {availableAutomations.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">{t('marketplace.publish.noAutomations')}</p>
        ) : (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void handlePublish(event)}>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.automationLabel')}</span>
              <select
                required
                value={sourceAutomationId}
                onChange={(event) => setSourceAutomationId(event.target.value)}
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
              <Input required value={publishName} onChange={(event) => setPublishName(event.target.value)} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.licenseLabel')}</span>
              <Input value={publishLicense} onChange={(event) => setPublishLicense(event.target.value)} />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">{t('marketplace.publish.descriptionLabel')}</span>
              <Input value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} />
            </label>
            {publishError ? <p className="sm:col-span-2 text-xs text-[color:var(--danger)]">{publishError}</p> : null}
            {publishSuccess ? <p className="sm:col-span-2 text-xs text-[color:var(--success)]">{t('marketplace.publish.success')}</p> : null}
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" loading={publishBusy}>{t('marketplace.publish.submit')}</Button>
            </div>
          </form>
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('marketplace.myItems.title')}</h2>
        {!mine || mine.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">{t('marketplace.myItems.empty')}</p>
        ) : (
          <div className="space-y-3">
            {mine.map((item) => (
              <div key={item.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--text)]">{item.name} <span className="font-normal text-[color:var(--muted)]">v{item.version}</span></p>
                    <Badge tone={item.status === 'published' ? 'success' : item.status === 'archived' ? 'neutral' : 'warning'} className="mt-1">
                      {t(`marketplace.myItems.status.${item.status}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.status !== 'archived' ? (
                      <Button type="button" variant="ghost" onClick={() => { setRepublishTargetId(item.id); setRepublishNote(''); }}>
                        <RefreshCw className="h-4 w-4" aria-hidden />{t('marketplace.myItems.republish')}
                      </Button>
                    ) : null}
                    {item.status !== 'archived' ? (
                      <Button type="button" variant="ghost" loading={archivingId === item.id} onClick={() => void handleArchive(item.id)}>
                        <Archive className="h-4 w-4" aria-hidden />{t('marketplace.myItems.archive')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {republishTargetId === item.id ? (
                  <form
                    className="mt-3 flex flex-wrap gap-2"
                    onSubmit={(event) => { event.preventDefault(); void handleRepublish(item.id); }}
                  >
                    <Input
                      required
                      value={republishNote}
                      onChange={(event) => setRepublishNote(event.target.value)}
                      placeholder={t('marketplace.myItems.republishNotePlaceholder')}
                      className="flex-1"
                    />
                    <Button type="submit" variant="primary" loading={republishBusy}>{t('marketplace.myItems.republishSubmit')}</Button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('marketplace.installs.title')}</h2>
        {!installs || installs.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">{t('marketplace.installs.empty')}</p>
        ) : (
          <div className="space-y-2">
            {installs.map((install) => (
              <div key={install.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
                <div>
                  <p className="font-mono text-xs text-[color:var(--muted)]">{install.installed_automation_id}</p>
                  <Badge tone={install.uninstalled_at ? 'neutral' : 'success'} className="mt-1">
                    {install.uninstalled_at ? t('marketplace.installs.uninstalled') : t('marketplace.installed')}
                  </Badge>
                </div>
                {!install.uninstalled_at ? (
                  <Button type="button" variant="ghost" loading={uninstallingId === install.id} onClick={() => void handleUninstall(install.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />{t('marketplace.installs.uninstall')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
