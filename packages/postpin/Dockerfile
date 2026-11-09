# syntax=docker/dockerfile:1
# PostPin web app and REST API. Build from the repo root:
#   docker build -f packages/postpin/Dockerfile --build-arg POSTPIN_VERSION=1.2.3 .
#
# The app is fully bundled (adapter-node bundles every devDependency) and migrations run through
# shared's own migrator, so the runtime image needs no node_modules at all.

ARG NODE_VERSION=26

# --- Build (glibc, for native build tools like esbuild and sharp) -------------------------------
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# Same pnpm version as CI and local development (packageManager in package.json)
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
COPY patches ./patches
# Every workspace manifest, so the workspace matches pnpm-lock.yaml
COPY packages/api-client-ts/package.json packages/api-client-ts/
COPY packages/desktop/package.json packages/desktop/
COPY packages/plugin-core/package.json packages/plugin-core/
COPY packages/plugin-electron/package.json packages/plugin-electron/
COPY packages/plugin-resolve/package.json packages/plugin-resolve/
COPY packages/postpin/package.json packages/postpin/
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/
# husky is not installed in the image, so the root prepare script would fail
RUN npm pkg delete scripts.prepare
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
	pnpm install --frozen-lockfile --filter "@postpin-io/postpin..." --filter @postpin-io/shared
COPY packages/shared packages/shared
COPY packages/postpin packages/postpin
RUN pnpm --filter @postpin-io/shared build:migrate
# The build needs no runtime env (env.ts makes it optional while building)
ARG POSTPIN_VERSION
RUN POSTPIN_VERSION=${POSTPIN_VERSION} pnpm --filter @postpin-io/postpin build

# --- Runtime ----------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
# npm is not needed at runtime
RUN apk add --no-cache tini \
	&& rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/packages/shared/dist/migrate.mjs ./migrate.mjs
COPY packages/shared/prisma/migrations ./migrations
# package.json for "type": "module"; it has no dependencies, everything is in the bundle
COPY packages/postpin/package.json packages/postpin/
COPY --from=build /app/packages/postpin/build packages/postpin/build
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ARG POSTPIN_VERSION
LABEL org.opencontainers.image.title="PostPin" \
	org.opencontainers.image.description="PostPin web app and REST API" \
	org.opencontainers.image.source="https://github.com/PostPin-io/postpin" \
	org.opencontainers.image.version="${POSTPIN_VERSION}"

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/sbin/tini", "--", "entrypoint.sh"]
CMD ["node", "packages/postpin/build"]
