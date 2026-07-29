'use client';

import { useEffect } from 'react';

import { useShellStore, type TopbarConfig } from '@/stores/use-shell-store';

/** Registers a page-specific TopbarConfig (breadcrumb/title/primary action)
 * for the lifetime of the calling component, clearing it on unmount so the
 * next page reverts to its default per-route title/subtitle. Deliberately
 * re-syncs on every render (no dependency array) rather than depending on
 * `config` by identity -- callers pass a fresh object/closures each render
 * (e.g. a save handler bound to current draft state), so an identity-based
 * dependency array would either loop or go stale. The extra store write per
 * render is cheap and only re-renders Topbar, not the calling page. */
export function useTopbarConfig(config: TopbarConfig): void {
  const setTopbarConfig = useShellStore((state) => state.setTopbarConfig);

  useEffect(() => {
    setTopbarConfig(config);
  });

  useEffect(() => () => setTopbarConfig(null), [setTopbarConfig]);
}
