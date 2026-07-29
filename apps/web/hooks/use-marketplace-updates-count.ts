'use client';

import { useQuery } from '@tanstack/react-query';

import { marketplaceClient } from '@/lib/api/marketplace';

/** Real, computed count -- an install "has an update" when the item's
 * current version (enriched server-side, see MarketplaceService.list_my_installs)
 * is newer than the version that was installed. No mocked number. */
export function useMarketplaceUpdatesCount(): number {
  const { data } = useQuery({
    queryKey: ['marketplace', 'installs', 'mine'],
    queryFn: marketplaceClient.myInstalls,
    staleTime: 60_000,
  });
  // Array.isArray guard, not just `?? []`: a malformed/unexpected response
  // shape (e.g. a test's generic catch-all mock) is still truthy and would
  // otherwise throw on .filter() -- this hook feeds the global Sidebar nav
  // badge, rendered on every authenticated page.
  const installs = Array.isArray(data) ? data : [];
  return installs.filter((install) => !install.uninstalled_at && install.update_available).length;
}
