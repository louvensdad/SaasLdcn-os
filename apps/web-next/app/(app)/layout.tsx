'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/i18n/i18n';
import { useSession } from '@/lib/session/session';

/** Every screen inside the shell needs a session; without one the person goes to sign in and comes back here. */
export default function SignedInLayout({ children }: { readonly children: ReactNode }) {
  const { state } = useSession();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'signed-out') return;
    const params = new URLSearchParams({ next: pathname });
    if (state.ended) params.set('state', 'expired');
    router.replace(`/signin?${params.toString()}`);
  }, [state, pathname, router]);

  if (state.status !== 'signed-in') {
    return <div className="checking" role="status" aria-live="polite">{t('shell.checking')}</div>;
  }
  return <AppShell>{children}</AppShell>;
}
