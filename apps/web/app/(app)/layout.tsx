import { AppShell } from '@/components/shell/app-shell';
import type { ReactNode } from 'react';

export default function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}
