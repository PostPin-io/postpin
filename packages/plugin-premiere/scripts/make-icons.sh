#!/usr/bin/env bash
# Renders the PostPin logo into public/icons/ for manifest.json: the panel icon (23x23, in Premiere's
# minimized panels and the Window > UXP Plugins menu) and the plugin icon (24x24, in the Creative Cloud
# plugin list), each at 1x and 2x, with the center bar light on dark themes and dark on light themes.
# The PNGs are committed, so the build doesn't need rsvg-convert. Rerun after the logo changes.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v rsvg-convert >/dev/null || { echo "needs rsvg-convert (brew install librsvg)" >&2; exit 1; }

out=public/icons
mkdir -p "$out"

# same paths as packages/postpin/static/favicon.svg, square viewBox
logo() {
	cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -104 1876 1876" fill="none" stroke-width="150" stroke-linecap="round">
	<path d="M75 1594V1082" stroke="#3d7fff" />
	<path d="M363 1594V862" stroke="#21b8cf" />
	<path d="M650 1594V1221" stroke="#31b86a" />
	<path d="M938 1594V501" stroke="$1" />
	<path d="M1226 1594V946" stroke="#f5b92f" />
	<path d="M1513 1594V1139" stroke="#e8559a" />
	<path d="M1801 1594V1003" stroke="#8a63d2" />
	<circle cx="938" cy="250" r="175" stroke="#e8461d" stroke-width="151" />
</svg>
SVG
}

render() { # name size bar-color
	for scale in 1 2; do
		suffix=$([ "$scale" = 1 ] && echo "" || echo "@${scale}x")
		logo "$3" | rsvg-convert -w $(($2 * scale)) -h $(($2 * scale)) -o "$out/$1$suffix.png"
	done
}

render panel-dark 23 "#f6f5f2"
render panel-light 23 "#2d2d32"
render plugin-dark 24 "#f6f5f2"
render plugin-light 24 "#2d2d32"
ls -1 "$out"
