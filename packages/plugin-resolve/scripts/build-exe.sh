#!/usr/bin/env bash
# Builds the Windows installer from dist/: release/PostPin-Resolve-<version>.exe (unsigned for now)
# Needs makensis (brew install makensis, apt install nsis).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p 'require("./package.json").version')
OUT="release/PostPin-Resolve-$VERSION.exe"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# main.js loads ./WorkflowIntegration.node; the installer installs the x64 or arm64 build of it
rsync -a --exclude '*.map' --exclude WorkflowIntegration.node dist/ "$work/stage/"
cp native/win32-x64/WorkflowIntegration.node "$work/stage/WorkflowIntegration.x64.node"
cp native/win32-arm64/WorkflowIntegration.node "$work/stage/WorkflowIntegration.arm64.node"

mkdir -p release
makensis -V2 -DVERSION="$VERSION" -DSTAGE="$work/stage" -DOUT="$PWD/$OUT" scripts/windows/installer.nsi
echo "$OUT"
