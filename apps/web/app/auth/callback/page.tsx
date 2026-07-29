import { Suspense } from 'react';

import { OAuthCallbackClient, OAuthCallbackFallback } from './oauth-callback-client';

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<OAuthCallbackFallback />}>
      <OAuthCallbackClient />
    </Suspense>
  );
}
