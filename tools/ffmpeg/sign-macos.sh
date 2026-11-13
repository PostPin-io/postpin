#!/usr/bin/env bash
# Signs (hardened runtime, timestamp) and notarizes the universal binaries. Expects the keychain set up.
set -euo pipefail
DIR=$1
IDENTITY=$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/{print $2; exit}')
for b in "$DIR/ffmpeg" "$DIR/ffprobe"; do
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$b"
  codesign --verify --strict --verbose=2 "$b"
done
# Bare binaries can't be stapled: notarize them, Gatekeeper finds the ticket online
key="$RUNNER_TEMP/AuthKey_${APPLE_API_KEY_ID}.p8"; printf '%s' "$APPLE_API_KEY_P8" > "$key"
ditto -c -k "$DIR" "$RUNNER_TEMP/ffmpeg-notarize.zip"
xcrun notarytool submit "$RUNNER_TEMP/ffmpeg-notarize.zip" --key "$key" \
  --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
