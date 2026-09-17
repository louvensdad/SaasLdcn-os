import type { Metadata } from 'next';
import { Instrument_Sans, Martian_Mono } from 'next/font/google';
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

/* V2 type pair: Instrument Sans for the interface, Martian Mono for backend words, readouts and code. */
const sans = Instrument_Sans({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--font-instrument', display: 'swap' });
const mono = Martian_Mono({ subsets: ['latin', 'latin-ext'], axes: ['wdth'], variable: '--font-martian', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'LDCN OS', template: '%s · LDCN OS' },
  description: 'LDCN OS — from an idea to software you can verify.',
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
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
