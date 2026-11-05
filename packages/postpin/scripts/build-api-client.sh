#!/bin/sh
# Generates the TypeScript API client from the OpenAPI spec into ../api-client-ts/src.
#
# The watcher can start this several times in a row (tsoa and prettier both write swagger.json).
# Runs wait for each other via a lock, and each run builds in its own temp dir, so they never
# delete or rename each other's files.
set -e

out=../api-client-ts
lock="$out/.build.lock"
tmp="$out/.src-tmp-$$"

# Take the lock; a lock whose process is gone (killed run) is taken over
while ! mkdir "$lock" 2>/dev/null; do
	pid=$(cat "$lock/pid" 2>/dev/null || true)
	if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
		rm -rf "$lock"
		continue
	fi
	sleep 0.2
done
echo $$ >"$lock/pid"
trap 'rm -rf "$tmp" "$lock"' EXIT INT TERM

npx @hey-api/openapi-ts --input src/api/build/swagger.json --output "$tmp"
prettier --write "$tmp" >/dev/null
rm -rf "$out/src"
mv "$tmp" "$out/src"
