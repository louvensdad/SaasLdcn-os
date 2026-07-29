'use client';

import type { MarketplaceItem } from '@/lib/api/marketplace';
import { MarketplaceEmptyState } from '@/components/marketplace/marketplace-empty-state';
import { MarketplaceItemCard } from '@/components/marketplace/marketplace-item-card';

interface Props {
  readonly items: readonly MarketplaceItem[];
  readonly installedItemIds: ReadonlySet<string>;
  readonly installingId: string | null;
  readonly currentUserId?: string;
  readonly onInstall: (itemId: string) => void;
  readonly onPublishFirst: () => void;
}

export function MarketplaceItemGrid({ items, installedItemIds, installingId, currentUserId, onInstall, onPublishFirst }: Props) {
  if (items.length === 0) {
    return <MarketplaceEmptyState onPublishFirst={onPublishFirst} />;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <MarketplaceItemCard
          key={item.id}
          item={item}
          installed={installedItemIds.has(item.id)}
          installing={installingId === item.id}
          isOwnItem={Boolean(currentUserId) && item.author_user_id === currentUserId}
          onInstall={() => onInstall(item.id)}
        />
      ))}
    </div>
  );
}
