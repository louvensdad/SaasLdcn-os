'use client';

import { Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import type { MarketplaceInstall } from '@/lib/api/marketplace';

interface Props {
  readonly installs: readonly MarketplaceInstall[] | null;
  readonly uninstallingId: string | null;
  readonly onUninstall: (installId: string) => void;
}

export function MyInstallationsList({ installs, uninstallingId, onUninstall }: Props) {
  const { t } = useLocale();

  return (
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
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={install.uninstalled_at ? 'neutral' : 'success'}>
                    {install.uninstalled_at ? t('marketplace.installs.uninstalled') : t('marketplace.installed')}
                  </Badge>
                  {!install.uninstalled_at && install.update_available ? (
                    <Badge tone="warning">{t('marketplace.installs.updateAvailable')}</Badge>
                  ) : null}
                </div>
              </div>
              {!install.uninstalled_at ? (
                <Button type="button" variant="ghost" loading={uninstallingId === install.id} onClick={() => onUninstall(install.id)}>
                  <Trash2 className="h-4 w-4" aria-hidden />{t('marketplace.installs.uninstall')}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
