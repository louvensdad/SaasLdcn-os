// Mirrors app/schemas/marketplace.py exactly -- see that file's module owner
// (app/models/marketplace.py) for why this is declarative-only (no
// third-party code execution): the only installable `kind` today is a
// snapshot of an owned Automation's trigger/action config.
export type MarketplaceItemStatus = 'draft' | 'published' | 'archived';
export type MarketplaceItemKind = 'automation_template';

export interface MarketplaceItemTriggerConfig {
  readonly cron?: string | null;
  readonly timezone: string;
}

export interface MarketplaceItemActionConfig {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string | null;
}

export interface MarketplaceItemContent {
  readonly trigger_type: 'manual' | 'scheduled';
  readonly trigger_config: MarketplaceItemTriggerConfig;
  readonly action_type: string;
  readonly action_config: MarketplaceItemActionConfig;
}

export interface MarketplaceItemChangelogEntry {
  readonly version: number;
  readonly note: string;
  readonly published_at: string;
}

export interface MarketplaceItem {
  readonly id: string;
  readonly author_user_id: string;
  readonly kind: MarketplaceItemKind;
  readonly source_automation_id: string;
  readonly name: string;
  readonly description: string;
  readonly license: string;
  readonly permissions: readonly string[];
  readonly price_cents: number;
  readonly version: number;
  readonly content: MarketplaceItemContent;
  readonly content_hash: string;
  readonly changelog: readonly MarketplaceItemChangelogEntry[];
  readonly status: MarketplaceItemStatus;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MarketplaceInstall {
  readonly id: string;
  readonly item_id: string;
  readonly item_version: number;
  readonly installed_automation_id: string;
  readonly installed_at: string;
  readonly uninstalled_at?: string | null;
}
