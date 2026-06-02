import './globals.css';

export const metadata = {
  title: 'ldcn-local-landing',
  description: 'ldcn-local-landing generated from deterministic LDCN OS static foundations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
