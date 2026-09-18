import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { Sprite } from '@/components/sprite';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/lib/i18n/locales';
import { DISPLAY_BOOTSTRAP } from '@/lib/preferences';

import { MESSAGES } from '@/lib/i18n/messages';

import { Providers } from './providers';
import './styles/tokens.css';
import './styles/app.css';
import './styles/canvas.css';
import './styles/screens.css';
import './globals.css';

/* The redesign names three system faces (REDESIGN.md §2) and no web font, so nothing is
   downloaded: Bahnschrift for headings, Arial for the interface, Consolas for technical
   metadata. The families are declared in globals.css. The redesign itself flags the
   follow-up -- "antes de produção, definir e licenciar a família final" -- because
   Bahnschrift ships with Windows and falls back elsewhere.
*/

export const metadata: Metadata = {
  title: { default: 'LDCN OS', template: '%s · LDCN OS' },
  description: 'LDCN OS — from an idea to software you can verify.',
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_BOOTSTRAP }} />
      </head>
      <body>
        <Sprite />
        <Providers locale={locale} messages={MESSAGES[locale]}>{children}</Providers>
      </body>
    </html>
  );
}
