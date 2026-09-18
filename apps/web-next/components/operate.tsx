'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { useI18n } from '@/lib/i18n/i18n';

import { Icon } from './signal';

/**
 * The pieces a screen is operated with, rather than only read: a filter row, a table that sorts and
 * pages and says how much it is showing, a detail panel that comes back to where it was opened from,
 * and a confirmation that states the scope of what it is about to do.
 *
 * REDESIGN.md §2 is the contract for all four: "Tabela — cabeçalho semântico, linhas legíveis,
 * paginação e total; filtros mantidos ao abrir detalhe", "Painel de detalhe — 440–520 px no desktop;
 * página inteira no celular; volta ao contexto anterior", "Confirmação — resumo da ação e alcance;
 * cancelar à esquerda e ação explícita à direita".
 */

export type SortDirection = 'asc' | 'desc';

export interface TableView<Row> {
  /** The rows to render: filtered, sorted and cut to the current page. */
  readonly rows: readonly Row[];
  /** Everything the screen was given, before any of that. */
  readonly total: number;
  /** What survived the search and the filters — the number a total is honest against. */
  readonly matched: number;
  readonly page: number;
  readonly pages: number;
  readonly setPage: (page: number) => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly sortKey: string | null;
  readonly sortDirection: SortDirection;
  readonly toggleSort: (key: string) => void;
}

/**
 * The state behind an operable list. It is deliberately not a component: the tables already written
 * keep their own markup and their own columns, and only borrow the behaviour.
 *
 * `search` returns the text a row is findable by; `sorters` maps a column key to the value to order
 * on. A row whose sorter returns null sinks to the bottom in both directions, because "not reported"
 * is not a small number.
 */
export function useTableView<Row>(rows: readonly Row[], options: {
  readonly search?: (row: Row) => string;
  readonly sorters?: Readonly<Record<string, (row: Row) => string | number | null | undefined>>;
  readonly initialSort?: readonly [string, SortDirection];
  readonly pageSize?: number;
  /** Anything that should send the list back to its first page when it changes (a filter, a scope). */
  readonly resetOn?: unknown;
}): TableView<Row> {
  const { search, sorters, initialSort, pageSize = 25, resetOn } = options;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.[0] ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSort?.[1] ?? 'asc');

  useEffect(() => { setPage(0); }, [query, resetOn]);

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !search) return rows;
    return rows.filter((row) => search(row).toLowerCase().includes(needle));
  }, [rows, query, search]);

  const sorted = useMemo(() => {
    const sorter = sortKey ? sorters?.[sortKey] : undefined;
    if (!sorter) return matched;
    const factor = sortDirection === 'asc' ? 1 : -1;
    return [...matched].sort((left, right) => {
      const a = sorter(left);
      const b = sorter(right);
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
      return String(a).localeCompare(String(b), undefined, { numeric: true }) * factor;
    });
  }, [matched, sortKey, sortDirection, sorters]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = useMemo(() => sorted.slice(current * pageSize, current * pageSize + pageSize), [sorted, current, pageSize]);

  const toggleSort = useCallback((key: string) => {
    setSortKey((previous) => {
      if (previous === key) {
        setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
        return previous;
      }
      setSortDirection('asc');
      return key;
    });
    setPage(0);
  }, []);

  return { rows: visible, total: rows.length, matched: sorted.length, page: current, pages, setPage, query, setQuery, sortKey, sortDirection, toggleSort };
}

/** A column header that orders the table, and says so to a screen reader. */
export function SortTh({ column, label, view, align }: {
  readonly column: string;
  readonly label: string;
  readonly view: Pick<TableView<unknown>, 'sortKey' | 'sortDirection' | 'toggleSort'>;
  readonly align?: 'right';
}) {
  const { t } = useI18n();
  const active = view.sortKey === column;
  const ascending = active && view.sortDirection === 'asc';
  return (
    <th aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'} className={align === 'right' ? 'r' : undefined}>
      <button
        type="button"
        className="th-sort"
        onClick={() => view.toggleSort(column)}
        aria-label={active ? t(ascending ? 'table.sortedAsc' : 'table.sortedDesc', { column: label }) : t('table.sortBy', { column: label })}
      >
        <span>{label}</span>
        <Icon name={active ? (ascending ? 'up' : 'down') : 'sort'} />
      </button>
    </th>
  );
}

/** How much of the list is on screen, and the way to the rest of it. */
export function TableFoot({ view, unit }: { readonly view: TableView<unknown>; readonly unit?: string }) {
  const { t } = useI18n();
  const from = view.rows.length === 0 ? 0 : view.page * (view.rows.length || 1) + 1;
  return (
    <div className="tablefoot">
      <span className="meta">
        {view.matched === view.total
          ? t('table.showing', { shown: String(view.rows.length), total: String(view.total), unit: unit ?? '' })
          : t('table.showingFiltered', { shown: String(view.rows.length), matched: String(view.matched), total: String(view.total), unit: unit ?? '' })}
      </span>
      {view.pages > 1 ? (
        <span className="row" style={{ gap: 6 }}>
          <span className="meta num">{t('table.page', { page: String(view.page + 1), pages: String(view.pages) })}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={view.page === 0} onClick={() => view.setPage(view.page - 1)}>{t('table.previous')}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={view.page >= view.pages - 1} onClick={() => view.setPage(view.page + 1)}>{t('table.next')}</button>
          <span className="sr-only">{from}</span>
        </span>
      ) : null}
    </div>
  );
}

/** The one row of controls above a list: what to look for, and which slice to look at. */
export function Toolbar({ view, placeholder, children }: {
  readonly view?: Pick<TableView<unknown>, 'query' | 'setQuery'>;
  readonly placeholder?: string;
  readonly children?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="toolbar">
      {view ? (
        <span className="searchfield">
          <Icon name="search" />
          <label className="sr-only" htmlFor={id}>{placeholder ?? t('toolbar.search')}</label>
          <input
            id={id}
            type="search"
            value={view.query}
            placeholder={placeholder ?? t('toolbar.search')}
            onChange={(event) => view.setQuery(event.target.value)}
          />
          {view.query ? (
            <button type="button" className="iconbtn" onClick={() => view.setQuery('')} aria-label={t('toolbar.clear')}>
              <Icon name="close" />
            </button>
          ) : null}
        </span>
      ) : null}
      {children ? <span className="pills">{children}</span> : null}
    </div>
  );
}

/** One choice in a filter row: pressed or not, never a checkbox pretending to be a button. */
export function Pill({ pressed, onClick, children }: { readonly pressed: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button type="button" className={`pill${pressed ? ' is-on' : ''}`} aria-pressed={pressed} onClick={onClick}>{children}</button>
  );
}

/**
 * A detail that opens beside the list instead of replacing it, so the filters behind it survive.
 * Escape closes it, the close button is focused when it opens, and focus goes back to whatever
 * opened it — that is what "volta ao contexto anterior" has to mean for a keyboard.
 */
export function DetailPanel({ title, kind, onClose, children, actions }: {
  readonly title: string;
  /** What the panel is about, in the reader's words — shown above the title. */
  readonly kind?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  return (
    <aside className="ctxpanel" role="dialog" aria-modal="false" aria-label={title}>
      <div className="cp-head">
        <div className="grow">
          {kind ? <div className="label">{kind}</div> : null}
          <div className="h-sub">{title}</div>
        </div>
        <button ref={closeRef} type="button" className="iconbtn" onClick={onClose} aria-label={t('panel.close')}>
          <Icon name="close" />
        </button>
      </div>
      <div className="cp-body">{children}</div>
      {actions ? <div className="cp-foot">{actions}</div> : null}
    </aside>
  );
}

/**
 * A confirmation that says what is about to happen and how far it reaches, with cancel on the left
 * and the real verb on the right. The verb is the same word as the control that opened it.
 */
export function Confirm({ title, scope, confirmLabel, danger, onConfirm, onCancel, children }: {
  readonly title: string;
  /** How far the action reaches: which project, how many rows, what it cannot undo. */
  readonly scope: ReactNode;
  readonly confirmLabel: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly children?: ReactNode;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="scrim" onClick={onCancel} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="h-sec">{title}</div>
        <div className="confirm-scope">
          <div className="label">{t('confirm.scope')}</div>
          <div className="body">{scope}</div>
        </div>
        {children}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel}>{t('confirm.cancel')}</button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
