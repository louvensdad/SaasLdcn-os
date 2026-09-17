import type { Metadata } from 'next';

import { LibraryScreen } from './library-screen';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  return <LibraryScreen />;
}
