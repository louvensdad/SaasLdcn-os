import type { Metadata } from 'next';

import { CommandScreen } from './command-screen';

export const metadata: Metadata = { title: 'Command Center' };

export default function CommandPage() {
  return <CommandScreen />;
}
