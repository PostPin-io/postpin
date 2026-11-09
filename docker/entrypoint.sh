#!/bin/sh
# Shared entrypoint of the app and worker images: applies pending database
# migrations, then runs the image's command. App and worker may start at the
# same time; the migrator takes Prisma's advisory lock, so only one of them
# migrates while the other waits.
set -e

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
	echo "Running database migrations…"
	node /app/migrate.mjs
fi

exec "$@"
