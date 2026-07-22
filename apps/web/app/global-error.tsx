'use client';

import { useEffect, useState } from 'react';

const ROOT_ERROR_COPY = {
  'pt-BR': {
    title: 'Algo deu errado',
    description: 'Não foi possível carregar a aplicação. Tente novamente ou recarregue a página.',
    retry: 'Tentar novamente',
    reload: 'Recarregar página',
  },
  'en-US': {
    title: 'Something went wrong',
    description: 'The application could not be loaded. Try again or reload the page.',
    retry: 'Try again',
    reload: 'Reload page',
  },
  'es-ES': {
    title: 'Algo salió mal',
    description: 'No se pudo cargar la aplicación. Inténtalo de nuevo o recarga la página.',
    retry: 'Intentar de nuevo',
    reload: 'Recargar página',
  },
  'fr-FR': {
    title: 'Une erreur est survenue',
    description: "L’application n’a pas pu être chargée. Réessayez ou rechargez la page.",
    retry: 'Réessayer',
    reload: 'Recharger la page',
  },
} as const;

type RootLocale = keyof typeof ROOT_ERROR_COPY;

// Only fires if the root layout itself throws (e.g. AppProviders), so this
// can't depend on the locale store, design tokens, or anything else the
// broken layout might own — plain inline-styled markup with its own <html>.
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const [locale, setLocale] = useState<RootLocale>('pt-BR');

  useEffect(() => {
    console.error('[global-error]', error);
    const language = navigator.language.toLowerCase();
    if (language.startsWith('en')) setLocale('en-US');
    else if (language.startsWith('es')) setLocale('es-ES');
    else if (language.startsWith('fr')) setLocale('fr-FR');
  }, [error]);

  const copy = ROOT_ERROR_COPY[locale];

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0b0b0f', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: '24px' }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontWeight: 600, marginBottom: 8 }}>{copy.title}</h1>
            <p style={{ color: '#a1a1aa', marginBottom: 20 }}>{copy.description}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontWeight: 600,
                  background: '#a78bfa',
                  color: '#0b0b0f',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {copy.retry}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#f4f4f5',
                  border: '1px solid #3f3f46',
                  cursor: 'pointer',
                }}
              >
                {copy.reload}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
