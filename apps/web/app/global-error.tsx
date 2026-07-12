'use client';

import { useEffect } from 'react';

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
  useEffect(() => {
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#0b0b0f', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: '24px' }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>
              Algo deu errado / Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#a1a1aa', marginBottom: 20 }}>
              Não foi possível carregar a aplicação. Tente novamente ou recarregue a página.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: '#a78bfa',
                  color: '#0b0b0f',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#f4f4f5',
                  border: '1px solid #3f3f46',
                  cursor: 'pointer',
                }}
              >
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
