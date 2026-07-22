import { Suspense } from 'react';
import { OAuthCallbackClient } from './oauth-callback-client';

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<main aria-busy="true">Finalizando autenticação…</main>}>
      <OAuthCallbackClient />
    </Suspense>
  );
}
