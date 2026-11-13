#!/usr/bin/env bash
# Signs (hardened runtime, timestamp) and notarizes the built addons in ../dist/mac/*/. Expects the
# Developer ID certificate in a keychain (.github/actions/signing-keychain) and APPLE_API_KEY_P8,
# APPLE_API_KEY_ID, APPLE_API_ISSUER for notarytool.
set -euo pipefail
cd "$(dirname "$0")/../dist/mac"
IDENTITY=$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/{print $2; exit}')
[ -n "$IDENTITY" ] || { echo "no Developer ID Application identity in the keychain" >&2; exit 1; }
for addon in */postpin-process.uxpaddon; do
	codesign --force --options runtime --timestamp --sign "$IDENTITY" "$addon"
	codesign --verify --strict --verbose=2 "$addon"
done
# A dylib can't be stapled: notarize it, Gatekeeper finds the ticket online
key="${RUNNER_TEMP:-/tmp}/AuthKey_${APPLE_API_KEY_ID}.p8"
printf '%s' "$APPLE_API_KEY_P8" > "$key"
zip="${RUNNER_TEMP:-/tmp}/premiere-addon-notarize.zip"
ditto -c -k . "$zip"
xcrun notarytool submit "$zip" --key "$key" --key-id "$APPLE_API_KEY_ID" \
	--issuer "$APPLE_API_ISSUER" --wait
rm -f "$key" "$zip"
