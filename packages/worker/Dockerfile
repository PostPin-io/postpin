# syntax=docker/dockerfile:1
# PostPin media worker (ffmpeg transcoding, thumbnails, probing). Build from the repo root:
#   docker build -f packages/worker/Dockerfile --build-arg POSTPIN_VERSION=1.2.3 .
#
# The worker is bundled with esbuild and migrations run through shared's own migrator, so the
# runtime image needs no node_modules at all.

ARG NODE_VERSION=26
ARG FFMPEG_VERSION=9.0.2

# Static ffmpeg/ffprobe builds: a fraction of Debian's ffmpeg with its X11/Mesa/Vulkan dependencies
FROM mwader/static-ffmpeg:${FFMPEG_VERSION} AS ffmpeg

# --- Build (glibc, for native build tools like esbuild) -------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
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
	pnpm install --frozen-lockfile --filter "@postpin-io/worker..."
COPY packages/shared packages/shared
COPY packages/worker packages/worker
RUN pnpm --filter @postpin-io/shared build:migrate \
	&& pnpm --filter @postpin-io/worker build

# --- Runtime ----------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
# npm is not needed at runtime
RUN apk add --no-cache tini \
	&& rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
WORKDIR /app
ENV NODE_ENV=production \
	MIGRATIONS_DIR=/app/migrations
COPY --from=build /app/packages/shared/dist/migrate.mjs ./migrate.mjs
COPY packages/shared/prisma/migrations ./migrations
COPY --from=build /app/packages/worker/dist packages/worker/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ARG POSTPIN_VERSION
LABEL org.opencontainers.image.title="PostPin Worker" \
	org.opencontainers.image.description="PostPin media worker (ffmpeg transcoding, thumbnails, probing)" \
	org.opencontainers.image.source="https://github.com/PostPin-io/postpin" \
	org.opencontainers.image.version="${POSTPIN_VERSION}"

USER node
ENTRYPOINT ["/sbin/tini", "--", "entrypoint.sh"]
CMD ["node", "--enable-source-maps", "packages/worker/dist/index.mjs"]
