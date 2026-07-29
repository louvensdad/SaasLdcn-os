FROM node:22-bookworm-slim AS dependencies
WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY apps/web ./
COPY packages /workspace/packages
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined at build time, not read at runtime -- pass the
# real public API origin as a build arg in production (see
# docker-compose.prod.yml). Unset (the default) falls through to
# lib/api/endpoints.ts's own http://localhost:8001 fallback, so this is a
# no-op for any existing build of this image.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --gid 10001 ldcn \
    && useradd --uid 10001 --gid ldcn --create-home ldcn \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=10001:10001 /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=10001:10001 /workspace/apps/web/.next/static ./.next/static
# next.config.ts sets output: 'standalone' -- the traced standalone bundle is
# server code + only the node_modules it needs, it never includes public/
# (Next.js's own documented deployment requirement, not optional). Without
# this, every static asset served straight from public/ (logo, favicon, ...)
# 404s at runtime even though the build succeeds cleanly.
COPY --from=build --chown=10001:10001 /workspace/apps/web/public ./public
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
