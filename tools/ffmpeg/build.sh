#!/usr/bin/env bash
# Builds a minimal static ffmpeg + ffprobe for one platform into out/<platform>/.
#   tools/ffmpeg/build.sh macos-arm64    # on an Apple Silicon Mac
#   tools/ffmpeg/build.sh macos-x64      # same Mac, cross compiled; needs nasm
#   tools/ffmpeg/build.sh windows-x64    # on Linux; needs mingw-w64, nasm
set -euo pipefail
PLATFORM=${1:?platform}
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-$HERE/.work}
OUT=$HERE/out/$PLATFORM
SRC=$WORK/src
PREFIX=$WORK/prefix-$PLATFORM
JOBS=$(getconf _NPROCESSORS_ONLN)
source "$HERE/configure-flags.sh"
mkdir -p "$SRC" "$PREFIX" "$OUT"

v() { node -p "require('$HERE/versions.json').$1"; }

# Downloads a pinned source once and unpacks it to $SRC/<name>
fetch() {
  local name=$1 url sha file
  url=$(v "$name.url"); sha=$(v "$name.sha256"); file=$SRC/$(basename "$url")
  [ -f "$file" ] || curl -fsSL -o "$file" "$url"
  echo "$sha  $file" | shasum -a 256 -c - >/dev/null
  rm -rf "$SRC/$name" && mkdir "$SRC/$name"
  tar xf "$file" -C "$SRC/$name" --strip-components 1
}

case $PLATFORM in
  macos-arm64)
    export MACOSX_DEPLOYMENT_TARGET=12.0
    X264_HOST=(); FF_CROSS=(); EXTRA=("${MACOS_FLAGS[@]}"); EXE= ;;
  macos-x64)
    export MACOSX_DEPLOYMENT_TARGET=12.0
    export CC="clang -arch x86_64"
    X264_HOST=(--host=x86_64-apple-darwin --extra-cflags="-arch x86_64" --extra-ldflags="-arch x86_64")
    FF_CROSS=(--enable-cross-compile --arch=x86_64 --target-os=darwin --cc="clang -arch x86_64")
    EXTRA=("${MACOS_FLAGS[@]}"); EXE= ;;
  windows-x64)
    CROSS=x86_64-w64-mingw32-
    X264_HOST=(--host=x86_64-w64-mingw32 --cross-prefix=$CROSS --enable-win32thread)
    FF_CROSS=(--enable-cross-compile --arch=x86_64 --target-os=mingw32 --cross-prefix=$CROSS
              --pkg-config=pkg-config --extra-ldflags="-static -static-libgcc")
    EXTRA=("${WINDOWS_FLAGS[@]}"); EXE=.exe ;;
  *) echo "unknown platform $PLATFORM" >&2; exit 1 ;;
esac

fetch x264
(cd "$SRC/x264" && ./configure --prefix="$PREFIX" --enable-static --disable-cli --enable-pic "${X264_HOST[@]}" \
  && make -j"$JOBS" && make install)

if [ "$PLATFORM" = windows-x64 ]; then
  fetch zlib
  (cd "$SRC/zlib" && make -f win32/Makefile.gcc PREFIX=$CROSS -j"$JOBS" \
    && make -f win32/Makefile.gcc install PREFIX=$CROSS BINARY_PATH="$PREFIX/bin" \
         INCLUDE_PATH="$PREFIX/include" LIBRARY_PATH="$PREFIX/lib")
fi

fetch ffmpeg
(cd "$SRC/ffmpeg" && PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig" ./configure \
  --prefix="$PREFIX" --pkg-config-flags=--static \
  --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib" \
  "${FF_CROSS[@]}" "${COMMON_FLAGS[@]}" "${EXTRA[@]}" \
  && make -j"$JOBS")

cp "$SRC/ffmpeg/ffmpeg$EXE" "$SRC/ffmpeg/ffprobe$EXE" "$OUT/"
case $PLATFORM in
  windows-x64) ${CROSS}strip "$OUT"/*.exe ;;
  *) strip "$OUT/ffmpeg" "$OUT/ffprobe" ;;
esac
if [ "$PLATFORM" = windows-x64 ]; then
  # a Windows binary doesn't run here: write what -buildconf would print, from config.h
  { echo "  configuration:"
    sed -n 's/^#define FFMPEG_CONFIGURATION "\(.*\)"$/\1/p' "$SRC/ffmpeg/config.h" | tr ' ' '\n' | sed '/^$/d; s/^/    /'
  } > "$OUT/BUILDCONF.txt"
else
  "$OUT/ffmpeg" -hide_banner -buildconf > "$OUT/BUILDCONF.txt"
fi
[ -s "$OUT/BUILDCONF.txt" ] || { echo "BUILDCONF.txt is empty" >&2; exit 1; }
ls -l "$OUT"
