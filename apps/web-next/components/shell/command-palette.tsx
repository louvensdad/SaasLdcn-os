'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Icon, Signal } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';
import { guidesFor } from '@/lib/learn/content';
import { ACTIONS, currentAppUrl, RAIL, RAIL_BOTTOM } from '@/lib/routes';

type Group = 'goto' | 'learn' | 'actions';

interface Item {
  readonly id: string;
  readonly group: Group;
  readonly label: string;
  readonly href?: string;
  readonly external?: boolean;
  readonly run?: () => void;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CommandPalette({ onClose, onLearnAbout }: { readonly onClose: () => void; readonly onLearnAbout: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<readonly Item[]>(() => {
    const destinations = [...ACTIONS, ...RAIL, ...RAIL_BOTTOM].map<Item>((d) => ({
      id: `goto-${d.id}`,
      group: 'goto',
      label: t(d.label),
      href: d.built ? d.path : currentAppUrl(d.current),
      external: !d.built,
    }));
    const learn: Item[] = [
      { id: 'learn-terms', group: 'learn', label: t('nav.learnTerms'), href: '/learn/terms' },
      ...guidesFor(locale).guides.map<Item>((g) => ({ id: `guide-${g.id}`, group: 'learn', label: t('palette.guide', { title: g.title }), href: `/learn/${g.id}` })),
    ];
    const actions: Item[] = [{ id: 'learn-about', group: 'actions', label: t('palette.learnAbout'), run: onLearnAbout }];
    return [...actions, ...destinations, ...learn];
  }, [t, locale, onLearnAbout]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return q ? items.filter((item) => normalize(item.label).includes(q)) : items;
  }, [items, query]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const open = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
    else if (item.external && item.href) window.location.assign(item.href);
    else if (item.href) router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((s) => Math.min(visible.length - 1, s + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
    if (event.key === 'Enter') { event.preventDefault(); open(visible[selected]); }
  };

  const groups: readonly Group[] = ['actions', 'goto', 'learn'];
  let index = -1;
  return (
    <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.label')} onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" />
          <input
            id="palette-input"
            type="text"
            autoFocus
            autoComplete="off"
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.placeholder')}
            aria-controls="palette-list"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {visible.length === 0 ? <div className="pal-item is-disabled">{t('palette.empty')}</div> : null}
          {groups.map((group) => {
            const members = visible.filter((item) => item.group === group);
            if (members.length === 0) return null;
            return (
              <div className="pal-group" key={group}>
                <span className="label">{t(`palette.group.${group}`)}</span>
                {members.map((item) => {
                  index += 1;
                  const position = index;
                  return (
                    <div
                      key={item.id}
                      className="pal-item"
                      role="option"
                      aria-selected={position === selected}
                      onMouseEnter={() => setSelected(position)}
                      onClick={() => open(item)}
                    >
                      {item.group === 'actions' ? <Signal family="hand" /> : <Icon name={item.group === 'learn' ? 'learn' : 'chevron'} />}
                      <span>{item.label}</span>
                      {item.external ? <span className="why">{t('common.currentApp')}</span> : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span><span className="kbd">↑↓</span> {t('palette.move')}</span>
          <span><span className="kbd">Enter</span> {t('palette.run')}</span>
          <span><span className="kbd">Esc</span> {t('palette.close')}</span>
        </div>
      </div>
    </div>
  );
}
