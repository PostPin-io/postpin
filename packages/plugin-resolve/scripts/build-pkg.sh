#!/usr/bin/env bash
# Builds the signed installer from dist/: release/PostPin-Resolve-<version>.pkg
# Notarizes and staples it when APPLE_API_KEY (path to the .p8), APPLE_API_KEY_ID and APPLE_API_ISSUER are set.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p 'require("./package.json").version')
IDENTITY="Developer ID Installer: Hannes Rueger (M273PG74WU)"
INSTALL_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/io.postpin.plugin.resolve"
OUT="release/PostPin-Resolve-$VERSION.pkg"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
rsync -a --exclude '*.map' dist/ "$work/root/"
mkdir -p release

# WorkflowIntegration.node is already signed by Blackmagic (Developer ID, hardened runtime, timestamp),
# which notarization accepts as is
pkgbuild --root "$work/root" --identifier io.postpin.plugin.resolve --version "$VERSION" \
	--install-location "$INSTALL_DIR" --scripts scripts/pkg "$work/component.pkg"

# Without a <title> in the distribution, Installer shows "" in its window title
productbuild --synthesize --package "$work/component.pkg" "$work/distribution.xml"
sed -i '' 's|<installer-gui-script minSpecVersion="[0-9]*">|&\
    <title>PostPin for DaVinci Resolve</title>|' "$work/distribution.xml"
productbuild --distribution "$work/distribution.xml" --package-path "$work" \
	--sign "$IDENTITY" --timestamp "$OUT"

if [[ -n "${APPLE_API_KEY:-}" ]]; then
	xcrun notarytool submit "$OUT" --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" \
		--issuer "$APPLE_API_ISSUER" --wait
	xcrun stapler staple "$OUT"
fi
