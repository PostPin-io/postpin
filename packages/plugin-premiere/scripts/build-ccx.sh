#!/usr/bin/env bash
# Packages dist/ as release/PostPin-Premiere-<version>.ccx (a plain zip with manifest.json at its root,
# the same as "Package" in the UXP Developer Tool). No signing outside the Adobe Marketplace.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p 'require("./package.json").version')
OUT="$PWD/release/PostPin-Premiere-$VERSION.ccx"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude '*.map' --exclude '.DS_Store' dist/ "$work/"

# UXP only accepts x.y.z in the manifest: 1.2.0-beta.1 -> 1.2.0
node -e '
	const fs = require("fs");
	const [file, version] = process.argv.slice(1);
	const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
	manifest.version = version.split("-")[0];
	fs.writeFileSync(file, JSON.stringify(manifest, null, 4) + "\n");
' "$work/manifest.json" "$VERSION"

mkdir -p release
rm -f "$OUT"
(cd "$work" && zip -qrX "$OUT" .)
echo "$OUT"
