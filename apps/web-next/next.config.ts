import type { NextConfig } from 'next';

// The browser only ever talks to this app's origin: /api/* is forwarded to the FastAPI backend server-side, so the
// refresh cookie stays first-party and no CORS rule is needed. Point LDCN_API_ORIGIN elsewhere for other setups.
const API_ORIGIN = process.env.LDCN_API_ORIGIN ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  // `next dev` and `next build` write incompatible output; sharing one directory corrupts whichever ran second,
  // and the dev server then serves chunks the build has already replaced. Each mode gets its own.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  // A traced server bundle for the container: `node server.js` with only the modules it actually needs.
  // Only the image build asks for it -- `next start`, which the tests and `npm start` use, does not work
  // with standalone output, and Next says so out loud when both are set.
  output: process.env.LDCN_STANDALONE === '1' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
  experimental: {
    // Model and build calls can take minutes; the proxy must not cut them at its 30 s default.
    proxyTimeout: 5 * 60 * 1000,
  },
};

export default nextConfig;
