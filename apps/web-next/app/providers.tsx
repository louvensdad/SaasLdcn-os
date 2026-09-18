'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { ApiError } from '@/lib/api/http';
import { I18nProvider } from '@/lib/i18n/i18n';
import type { Locale } from '@/lib/i18n/locales';
import type { Messages } from '@/lib/i18n/messages';
import { SessionProvider } from '@/lib/session/session';

export function Providers({ locale, messages, children }: {
  readonly locale: Locale;
  readonly messages: Messages;
  readonly children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // A 4xx answer is a fact about the request, not a hiccup: showing it beats retrying it.
            retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale} initialMessages={messages}>
        <SessionProvider>{children}</SessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
