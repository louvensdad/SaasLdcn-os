import { AppShell } from '@/components/shell/app-shell';
import type { ReactNode } from 'react';

// /pricing must stay reachable by signed-out visitors (vault: "Rotas
// públicas: /{locale}/pricing"), so it can't live in app/(app) -- that
// group's layout hard-redirects unauthenticated sessions to /login. This
// nests the SAME AppShell instead of a second chrome/visual system: it shows
// Sidebar+Topbar once a session is present, and nothing but the page itself
// otherwise.
export default function PricingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell requireAuth={false}>{children}</AppShell>;
}
