import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CallbackScreen } from './callback-screen';

export const metadata: Metadata = { title: 'Returning from the provider' };

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackScreen />
    </Suspense>
  );
}
