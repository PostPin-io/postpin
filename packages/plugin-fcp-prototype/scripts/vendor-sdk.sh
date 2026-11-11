#!/bin/bash
# PROTOTYPE: unpacks Apple's Workflow Extensions SDK into vendor/ (gitignored) without running the installer.
# Source, in this order: $1 (a .dmg or .pkg), the installed SDK in /Library/Developer/SDKs.
# Download: https://developer.apple.com/download/all/?q=workflow%20extensions (Apple ID needed)
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=vendor/WorkflowExtensionSDK.sdk
[ -d "$DEST" ] && { echo "SDK already in $DEST"; exit 0; }
mkdir -p vendor
SRC="${1:-}"
if [ -z "$SRC" ] && [ -d /Library/Developer/SDKs/WorkflowExtensionSDK.sdk ]; then
	cp -R /Library/Developer/SDKs/WorkflowExtensionSDK.sdk "$DEST"
	echo "copied installed SDK"; exit 0
fi
[ -n "$SRC" ] || { echo "Workflow Extensions SDK not found. Download the .dmg from Apple and run: $0 <file.dmg>"; exit 1; }
TMP=$(mktemp -d)
trap 'hdiutil detach "$TMP/mnt" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
PKG="$SRC"
if [[ "$SRC" == *.dmg ]]; then
	mkdir "$TMP/mnt"
	hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$TMP/mnt" "$SRC" >/dev/null
	PKG=$(find "$TMP/mnt" -maxdepth 1 -name "*.pkg" | head -1)
fi
pkgutil --check-signature "$PKG" | grep -q "signed Apple Software" || { echo "$PKG is not signed by Apple"; exit 1; }
pkgutil --expand-full "$PKG" "$TMP/pkg" >/dev/null
SDK=$(find "$TMP/pkg" -type d -name WorkflowExtensionSDK.sdk | head -1)
cp -R "$SDK" "$DEST"
echo "SDK unpacked to $DEST"
