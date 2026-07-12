import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppProviders } from '@/components/providers/app-providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'LDCN OS',
  description: 'Enterprise cinematic intelligence frontend foundation.',
};

// Keep in sync with THEMES in lib/themes.ts and the persist key in
// stores/use-shell-store.ts. Runs before hydration so the correct
// theme paints on first frame instead of flashing the dark default.
const THEME_INIT_SCRIPT = `(function () {
  try {
    var raw = localStorage.getItem('ldcn-shell-v4');
    var themeId = 'dark';
    if (raw) {
      var candidate = JSON.parse(raw).state.themeId;
      if (candidate === 'light' || candidate === 'dark') themeId = candidate;
    }
    var root = document.documentElement;
    root.dataset.theme = themeId;
    root.style.setProperty('--theme-accent', themeId === 'light' ? '#6d28d9' : '#a78bfa');
    root.style.setProperty('--theme-accent-secondary', themeId === 'light' ? '#087f8c' : '#22b8c7');
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
