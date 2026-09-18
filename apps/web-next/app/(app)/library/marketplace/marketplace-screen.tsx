'use client';

import { useQuery } from '@tanstack/react-query';

import { Signal } from '@/components/signal';
import { Badge, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

/** `price_cents` is an integer in cents; 0 means the author published it free, not "unset". */
function price(cents: number, locale: string, free: string) {
  if (cents === 0) return free;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function MarketplaceScreen() {
  const { t, locale } = useI18n();
  const items = useQuery({ queryKey: ['marketplace-items'], queryFn: api.marketplaceItems, retry: false });
  const mine = useQuery({ queryKey: ['marketplace-mine'], queryFn: api.marketplaceMine, retry: false });
  const installs = useQuery({ queryKey: ['marketplace-installs'], queryFn: api.marketplaceInstalls, retry: false });

  const published = items.data ?? [];
  const authored = mine.data ?? [];
  const installed = (installs.data ?? []).filter((install) => !install.uninstalled_at);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.library')}</span></div>
          <h1 className="title">{t('marketplace.title')}</h1>
          <p className="lede">{t('marketplace.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('marketplace.published.title')}</h2>
          <span className="meta">{t('marketplace.published.meta', { count: published.length })}</span>
        </div>

        {items.isPending ? <Skeleton lines={4} /> : null}
        {items.isError ? <StateBlock kind="error" title={t('marketplace.unreadable')}>{t('marketplace.unreadableBody')}</StateBlock> : null}
        {items.data && published.length === 0 ? (
          <StateBlock kind="empty" title={t('marketplace.published.none')}>{t('marketplace.published.noneBody')}</StateBlock>
        ) : null}

        <div className="list">
          {published.map((item) => (
            <div className="li" key={item.id}>
              <Signal family={familyFor(item.status)} label={item.name} />
              <span className="li-title">{item.name}</span>
              <span className="li-aux">
                <Badge value={item.status} family={familyFor(item.status)} />
                <span className="meta mono">{price(item.price_cents, locale, t('marketplace.free'))}</span>
              </span>
              <span className="li-sub">{item.description}</span>
              <div className="chips">
                <span className="chip mono">{item.category}</span>
                <span className="chip mono">v{item.version}</span>
                <span className="chip mono">{t('marketplace.downloads', { count: item.downloads })}</span>
                <span className="chip mono">{item.license}</span>
                {item.permissions.map((permission) => <span className="chip" key={permission}>{permission}</span>)}
              </div>
            </div>
          ))}
        </div>
        <p className="meta">{t('marketplace.permissions.note')}</p>
        <Source>GET /api/marketplace/items</Source>
      </section>

      <div className="grid g-2 g-start">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('marketplace.mine.title')}</h2>
            <span className="meta">{t('marketplace.mine.meta', { count: authored.length })}</span>
          </div>
          {mine.isError ? <p className="meta">{t('marketplace.unreadableBody')}</p> : null}
          {mine.data && authored.length === 0 ? <p className="meta">{t('marketplace.mine.none')}</p> : null}
          <div className="list">
            {authored.map((item) => (
              <div className="li" key={item.id}>
                <Signal family={familyFor(item.status)} label={item.name} />
                <span className="li-title">{item.name}</span>
                <Badge value={item.status} family={familyFor(item.status)} />
                <span className="li-sub">{t('marketplace.mine.row', { version: item.version, when: formatWhen(item.updated_at, locale) })}</span>
              </div>
            ))}
          </div>
          <Source>GET /api/marketplace/items/mine</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('marketplace.installs.title')}</h2>
            <span className="meta">{t('marketplace.installs.meta', { count: installed.length })}</span>
          </div>
          {installs.isError ? <p className="meta">{t('marketplace.unreadableBody')}</p> : null}
          {installs.data && installed.length === 0 ? <p className="meta">{t('marketplace.installs.none')}</p> : null}
          <div className="list">
            {installed.map((install) => (
              <div className="li" key={install.id}>
                <Signal family={install.update_available ? 'caution' : 'proof'} label={install.item_id} />
                <span className="li-title mono">{install.item_id}</span>
                <span className="meta mono">v{install.item_version}</span>
                <span className="li-sub">
                  {install.update_available && install.current_item_version != null
                    ? t('marketplace.installs.update', { version: install.current_item_version })
                    : t('marketplace.installs.current', { when: formatWhen(install.installed_at, locale) })}
                </span>
              </div>
            ))}
          </div>
          <Source>GET /api/marketplace/installs/mine</Source>
        </section>
      </div>

      <p className="meta" style={{ marginTop: 16 }}>{t('marketplace.note')}</p>
    </>
  );
}
