# syntax=docker/dockerfile:1

# ── Build the webapp ────────────────────────────────────────────
FROM node:22-alpine AS webapp
WORKDIR /repo
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY webapp/package.json webapp/
COPY server/package.json server/
COPY mobile/package.json mobile/
RUN npm ci --workspace @babyfunken/webapp --include-workspace-root
COPY shared/ shared/
COPY webapp/ webapp/
RUN npm run build --workspace @babyfunken/webapp

# ── Server dependencies ─────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY webapp/package.json webapp/
COPY mobile/package.json mobile/
RUN npm ci --workspace @babyfunken/server --include-workspace-root --omit=dev

# ── Runtime ─────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo

RUN apk add --no-cache tini && addgroup -S app && adduser -S app -G app

# npm workspaces hoist everything to the root node_modules, including the
# @babyfunken/shared symlink that resolves to ./shared.
COPY --from=deps   /repo/node_modules  ./node_modules
COPY --from=deps   /repo/package.json  ./package.json
COPY shared/       ./shared/
COPY server/       ./server/
COPY --from=webapp /repo/webapp/dist   ./webapp/dist

USER app
EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps zombies and forwards SIGTERM, so the graceful shutdown in
# server/index.js actually runs.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
