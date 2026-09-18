FROM node:22-bookworm-slim AS dependencies
WORKDIR /workspace/apps/web-next
COPY apps/web-next/package.json apps/web-next/package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY apps/web-next ./
# The contracts are imported through the `@contracts/*` path alias, so the build needs the real files.
COPY packages /workspace/packages
ENV NEXT_TELEMETRY_DISABLED=1     LDCN_STANDALONE=1
# Unlike apps/web, nothing here is inlined at build time: the browser only ever talks to this app's own
# origin, and `/api/*` is forwarded server-side to LDCN_API_ORIGIN, which is read at runtime.
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --gid 10001 ldcn \
    && useradd --uid 10001 --gid ldcn --create-home ldcn \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=build --chown=10001:10001 /workspace/apps/web-next/.next/standalone ./
COPY --from=build --chown=10001:10001 /workspace/apps/web-next/.next/static ./.next/static
# No `public/`: this app ships no static asset of its own -- the icon sprite is part of the bundle.
USER 10001:10001
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3200/signin').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
