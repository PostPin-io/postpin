#!/bin/bash
# PROTOTYPE: builds the FCP lab, installs it to ~/Applications and registers the workflow extension.
#   ./run.sh [path/to/Workflow_Extensions_1.0.3.dmg]
set -euo pipefail
cd "$(dirname "$0")"
command -v xcodegen >/dev/null || { echo "brew install xcodegen"; exit 1; }
scripts/vendor-sdk.sh "${1:-}"
IDENTITY="${FCP_LAB_SIGN_IDENTITY:-$(security find-identity -v -p codesigning | awk '/Apple Development/ {print $2; exit}')}"
[ -n "$IDENTITY" ] || { echo "no 'Apple Development' signing identity found, set FCP_LAB_SIGN_IDENTITY"; exit 1; }
xcodegen generate --quiet
xcodebuild -project PostPinFCPLab.xcodeproj -scheme PostPinFCPLab -configuration Debug \
	-derivedDataPath build FCP_LAB_SIGN_IDENTITY="$IDENTITY" -quiet build
APP="build/Build/Products/Debug/PostPin FCP Lab.app"
DEST="$HOME/Applications/PostPin FCP Lab.app"
pkill -x "PostPin FCP Lab" 2>/dev/null || true
pkill -x "PostPin Lab" 2>/dev/null || true
mkdir -p "$HOME/Applications"
rm -rf "$DEST"
cp -R "$APP" "$DEST"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
# only the installed copy may be known, otherwise FCP loads the extension from build/
pluginkit -r "$APP/Contents/PlugIns/PostPin Lab.appex" 2>/dev/null || true
"$LSREGISTER" -u "$APP" 2>/dev/null || true
"$LSREGISTER" -f "$DEST"
pluginkit -a "$DEST/Contents/PlugIns/PostPin Lab.appex"
echo "registered extensions:"; pluginkit -m -v -i io.postpin.prototype.fcplab.extension || true
open "$DEST"
echo "Fertig. In Final Cut: Fenster › Erweiterungen (bzw. Erweiterungen-Taste in der Werkzeugleiste) › PostPin Lab"
