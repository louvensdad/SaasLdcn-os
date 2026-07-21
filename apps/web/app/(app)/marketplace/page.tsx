'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { MarketplaceHeader } from '@/components/marketplace/marketplace-header';
import { MarketplaceItemGrid } from '@/components/marketplace/marketplace-item-grid';
import { MarketplacePublishForm } from '@/components/marketplace/marketplace-publish-cta';
import { MarketplaceSearchBar, type MarketplaceSort } from '@/components/marketplace/marketplace-search-bar';
import { MyInstallationsList } from '@/components/marketplace/marketplace-my-installations';
import { MyItemsDashboard } from '@/components/marketplace/marketplace-my-items';
import { useLocale } from '@/hooks/use-locale';
import { automationsClient, type Automation } from '@/lib/api/automations';
import { marketplaceClient, type MarketplaceInstall, type MarketplaceItem } from '@/lib/api/marketplace';
import { useAuthStore } from '@/stores/use-auth-store';

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

const SEARCH_DEBOUNCE_MS = 300;

export default function MarketplacePage() {
  const { t } = useLocale();
  const currentUserId = useAuthStore((state) => state.user?.user_id);

  const [catalog, setCatalog] = useState<MarketplaceItem[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<MarketplaceSort>('recent');
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

  // Debounced live search -- the backend match is a client-substring filter,
  // so re-fetching on every keystroke would be wasted round-trips.
  useEffect(() => {
    const timer = setTimeout(() => void loadCatalog(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const availableAutomations = useMemo(() => (automations ?? []).filter((automation) => automation.status !== 'archived'), [automations]);

  const categories = useMemo(
    () => Array.from(new Set((catalog ?? []).map((item) => item.category))).sort(),
    [catalog],
  );

  const visibleItems = useMemo(() => {
    const items = (catalog ?? []).filter((item) => !category || item.category === category);
    const sorted = [...items];
    if (sort === 'downloads') sorted.sort((a, b) => b.downloads - a.downloads);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return sorted;
  }, [catalog, category, sort]);

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
      await Promise.all([loadMine(), loadInstalls()]);
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

  function scrollToPublishForm() {
    document.getElementById('marketplace-publish')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="space-y-8">
      <MarketplaceHeader catalog={catalog} />

      <MarketplaceSearchBar
        search={search}
        onSearchChange={setSearch}
        categories={categories}
        category={category}
        onCategoryChange={setCategory}
        sort={sort}
        onSortChange={setSort}
      />

      {catalogError ? (
        <PageError title={t('marketplace.error.title')} description={catalogError} onRetry={() => void loadCatalog(search)} />
      ) : !catalog ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <CardLoading /><CardLoading /><CardLoading />
        </div>
      ) : (
        <MarketplaceItemGrid
          items={visibleItems}
          installedItemIds={installedItemIds}
          installingId={installingId}
          currentUserId={currentUserId}
          onInstall={handleInstall}
          onPublishFirst={scrollToPublishForm}
        />
      )}

      <MarketplacePublishForm
        availableAutomations={availableAutomations}
        sourceAutomationId={sourceAutomationId}
        onSourceAutomationIdChange={setSourceAutomationId}
        name={publishName}
        onNameChange={setPublishName}
        description={publishDescription}
        onDescriptionChange={setPublishDescription}
        license={publishLicense}
        onLicenseChange={setPublishLicense}
        busy={publishBusy}
        error={publishError}
        success={publishSuccess}
        onSubmit={handlePublish}
      />

      <MyItemsDashboard
        items={mine}
        archivingId={archivingId}
        onArchive={handleArchive}
        republishTargetId={republishTargetId}
        onStartRepublish={(itemId) => { setRepublishTargetId(itemId); setRepublishNote(''); }}
        republishNote={republishNote}
        onRepublishNoteChange={setRepublishNote}
        republishBusy={republishBusy}
        onRepublishSubmit={handleRepublish}
      />

      <MyInstallationsList installs={installs} uninstallingId={uninstallingId} onUninstall={handleUninstall} />
    </div>
  );
}
