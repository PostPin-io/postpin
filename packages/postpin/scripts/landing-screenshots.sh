#!/usr/bin/env bash
# Copies the screenshots of the landing page from the docs repo into static/landing/ as WebP,
# and the editors' app icons from plugin-core.
# Web screenshots come in a light and a dark version (<name>-light.webp, <name>-dark.webp), so the
# page can follow the color scheme. Plugin screenshots only exist in dark, like the plugins.
# Rerun after the UI changed and the docs screenshots were regenerated.
#   scripts/landing-screenshots.sh [path to the docs repo, default ../../../docs]
set -euo pipefail
cd "$(dirname "$0")/.."
command -v cwebp >/dev/null || { echo "needs cwebp (brew install webp)" >&2; exit 1; }

docs=${1:-../../../docs}
src=$docs/static/img/screenshots
[ -d "$src" ] || { echo "no screenshots in $src" >&2; exit 1; }

out=static/landing
rm -rf "$out"
mkdir -p "$out"

# name width
web=(
	"review 2000"
	"review-marker 1600"
	"share-view 1600"
)
for entry in "${web[@]}"; do
	read -r name width <<<"$entry"
	cwebp -quiet -q 82 -resize "$width" 0 "$src/web/$name.png" -o "$out/$name-light.webp"
	cwebp -quiet -q 82 -resize "$width" 0 "$src/web/$name-dark.png" -o "$out/$name-dark.webp"
done

plugins=(
	"resolve-main 1400"
	"desktop-main 1400"
)
for entry in "${plugins[@]}"; do
	read -r name width <<<"$entry"
	cwebp -quiet -q 82 -resize "$width" 0 "$src/plugins/$name.png" -o "$out/$name.webp"
done

# The editors' app icons, the same the plugins show
cp ../plugin-core/src/ui/logos/{davinci-resolve,premiere-pro,pro-tools}.png "$out/"

ls -l "$out"
