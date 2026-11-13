#!/usr/bin/env bash
# Builds the addon into ../dist/mac/<arch>/postpin-process.uxpaddon (the layout UXP loads) and runs
# the tests. Needs the Rust targets aarch64-apple-darwin and x86_64-apple-darwin, and the SDK headers
# in vendor/uxp-hybrid-sdk (or UXP_HYBRID_SDK), see vendor/uxp-hybrid-sdk/SOURCE.md.
set -euo pipefail
cd "$(dirname "$0")"
if [ "$(uname)" != Darwin ]; then
	echo "build-mac.sh runs on macOS; Windows: build-win.ps1" >&2
	exit 1
fi
export MACOSX_DEPLOYMENT_TARGET=12.0
# bindgen needs libclang: from the Command Line Tools, or from Xcode (GitHub's macOS runners)
if [ -z "${LIBCLANG_PATH:-}" ]; then
	for dir in /Library/Developer/CommandLineTools/usr/lib \
		"$(xcode-select -p)/Toolchains/XcodeDefault.xctoolchain/usr/lib"; do
		if [ -f "$dir/libclang.dylib" ]; then
			export LIBCLANG_PATH=$dir
			break
		fi
	done
fi
cargo test --release
for t in aarch64-apple-darwin:arm64 x86_64-apple-darwin:x64; do
	target=${t%%:*} dir=${t##*:}
	cargo build --release --target "$target"
	mkdir -p "../dist/mac/$dir"
	cp "target/$target/release/libpostpin_process.dylib" "../dist/mac/$dir/postpin-process.uxpaddon"
	# exactly the two entry points may be exported
	exports=$(nm -gU "../dist/mac/$dir/postpin-process.uxpaddon" | awk '{print $3}' | sort | tr '\n' ' ')
	if [ "$exports" != "_uxp_addon_init _uxp_addon_terminate " ]; then
		echo "unexpected exports in the $dir addon: $exports" >&2
		exit 1
	fi
done
echo "addon: ../dist/mac/{arm64,x64}/postpin-process.uxpaddon"
