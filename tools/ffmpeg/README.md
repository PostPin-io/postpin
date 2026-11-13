# ffmpeg for the PostPin plugins

PostPin Desktop, the DaVinci Resolve plugin and the Premiere Pro plugin encode the review versions
(HLS proxies) on the editor's machine, so they ship their own `ffmpeg` and `ffprobe`. This folder
builds them: a minimal static build with only what the plugins use, about 20 MB per architecture
instead of about 130 MB for a full build.

The binaries are released separately from PostPin (tags `ffmpeg-v<ffmpeg version>-<build>`), because
they change rarely. The plugin builds take the pinned release with `fetch.mjs`.

## What's in here

| File                    | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `versions.json`         | Pinned sources (ffmpeg, x264, zlib) with SHA-256, and the released binaries            |
| `configure-flags.sh`    | The component list: everything is off, only what the plugins use is on                 |
| `build.sh <platform>`   | Builds `macos-arm64`, `macos-x64` (cross, on a Mac) or `windows-x64` (cross, on Linux) |
| `sign-macos.sh <dir>`   | Signs (hardened runtime) and notarizes the macOS binaries                              |
| `fetch.mjs`             | Puts the pinned binaries into a plugin build                                           |
| `test/run.mjs <dir>`    | Checks a build against everything the plugins do with it                               |
| `test/make-fixtures.sh` | Writes the test clips in `test/fixtures/` (once, needs a full ffmpeg)                  |
| `LICENSE.md`            | GPL notice, ships next to the binaries                                                 |

`build.sh` works in `.work/` and writes to `out/<platform>/`; both are git-ignored.

## Using it in a plugin build

```sh
node tools/ffmpeg/fetch.mjs macos-universal packages/desktop/bin/mac
node tools/ffmpeg/fetch.mjs windows-x64 packages/desktop/bin/win
```

This downloads the release asset once into `~/.cache/postpin-ffmpeg` (Windows: `%LOCALAPPDATA%`),
checks its SHA-256 and unpacks `ffmpeg`, `ffprobe`, `LICENSE.md` and `BUILDCONF.txt`. A wrong
checksum stops the build; there is no fallback to another ffmpeg.

While developing, any ffmpeg with `libx264` works, e.g. Homebrew's or a local build:

```sh
FFMPEG_DIR=/opt/homebrew/bin node tools/ffmpeg/fetch.mjs macos-universal packages/desktop/bin/mac
FFMPEG_DIR=tools/ffmpeg/out/macos-arm64 node tools/ffmpeg/fetch.mjs macos-universal <dest>
```

A full build hides missing components, so test with the minimal one before a release.
`FFMPEG_RELEASES_URL` points the download at a mirror with the same layout (`<url>/<tag>/<file>`).

## Building locally

macOS (Apple Silicon), needs Node, `pkg-config` and, for the Intel slice, `nasm`:

```sh
tools/ffmpeg/build.sh macos-arm64
node tools/ffmpeg/test/run.mjs tools/ffmpeg/out/macos-arm64

brew install nasm
tools/ffmpeg/build.sh macos-x64
mkdir -p tools/ffmpeg/out/macos-universal
for b in ffmpeg ffprobe; do
  lipo -create tools/ffmpeg/out/macos-{arm64,x64}/$b -output tools/ffmpeg/out/macos-universal/$b
done
cp tools/ffmpeg/out/macos-arm64/BUILDCONF.txt tools/ffmpeg/out/macos-universal/
node tools/ffmpeg/test/run.mjs tools/ffmpeg/out/macos-universal --universal
FFMPEG_ARCH=x86_64 node tools/ffmpeg/test/run.mjs tools/ffmpeg/out/macos-universal  # under Rosetta
```

Windows, cross compiled on Linux (e.g. `docker run -it -v "$PWD:/src" -w /src ubuntu:24.04`):

```sh
apt-get update && apt-get install -y build-essential mingw-w64 nasm pkg-config curl nodejs
tools/ffmpeg/build.sh windows-x64
x86_64-w64-mingw32-objdump -p tools/ffmpeg/out/windows-x64/ffmpeg.exe | grep "DLL Name"
```

The DLL list must only show Windows' own DLLs, no `libwinpthread`, `zlib1` or `libgcc`. `run.mjs`
for Windows runs on Windows: copy `out/windows-x64` there, or let CI do it.

A build takes a few minutes per platform. The sources are downloaded once into `.work/src` and
checked against `versions.json`.

## Tests

`test/run.mjs` exits non-zero on the first failing build and prints every check:

- the build configuration (GPL, x264, no network) and that only system libraries are linked
- with `--universal`: arm64 and x86_64; with `--signed`: a valid signature with hardened runtime
- every clip in `test/fixtures/` decodes, and ffprobe reports the codec in its file name
- review proxies from a 4K source with `hlsArgs()` from `packages/shared/src/media/hls.ts`: four
  renditions, byte ranges that match the files, H.264 levels 5.2 and 4.2, AAC
- the rotation of `rotated.mp4`, through `displaySize()`
- scene detection with `sceneDetectArgs()` from `packages/shared/src/media/scene-detect.ts` finds
  the cut in `cuts.mp4`
- on macOS: VideoToolbox encode and decode (a warning only, CI runners may not have it)

The tests use the same shared code as the worker and the plugins, so a change to `hlsArgs()` or
`sceneDetectArgs()` that needs another ffmpeg component fails here first.

## Adding a codec, format or filter

`configure` accepts unknown names **without a warning** (e.g. `v410`, which ffmpeg 9 removed), so
every entry needs a test:

1. Add it to `configure-flags.sh`. Decoders usually need their parser and demuxer too, `-f null`
   needs the `wrapped_avframe` encoder.
2. Add a clip to `test/make-fixtures.sh`, named after the codec ffprobe reports (`cfhd.mov`,
   `pcm_s24be.aiff`). Keep it tiny: they are committed (5 frames, 0.2 s of sound).
3. Generate it with a full ffmpeg build, e.g. from https://ffmpeg.martin-riedl.de:
   `FULL_FFMPEG=/path/to/full/ffmpeg tools/ffmpeg/test/make-fixtures.sh`
4. Build and run `test/run.mjs`.
5. Bump `build` in `versions.json` (`ffmpeg-v9.0.2-1` becomes `-2`) and release.

New ffmpeg command lines in the plugins (thumbnails, scene detection, ...) belong in
`packages/shared/src/media/` with a check in `run.mjs`, so CI tests them against this build.

## Releasing

CI (`.github/workflows/ffmpeg.yml`) builds and tests every pull request that touches this folder or
`packages/shared/src/media/`. A tag also signs, notarizes and publishes:

1. Update `versions.json`: `build`, and `release.tag` / the asset file names to match.
2. Tag and push, e.g. `git tag ffmpeg-v9.0.2-2 && git push origin ffmpeg-v9.0.2-2`.
3. The release gets the binaries, `SHA256SUMS`, `versions.json` and the exact source archives (the
   GPL asks for the sources next to the binaries).
4. Copy the two asset checksums from `SHA256SUMS` into `versions.json` (`release.assets`) and commit.
   From then on the plugin builds use the new binaries.

`ffmpeg-v*` tags don't trigger the PostPin release (`release.yml` only reacts to `v<semver>`).

Updating ffmpeg itself: change `ffmpeg.version`, `url` and `sha256` (`shasum -a 256`), set `build`
back to `1`, then the same steps. Pin x264 to a commit of its `stable` branch
(`git ls-remote https://code.videolan.org/videolan/x264.git refs/heads/stable`).

## macOS signing

The tag build signs with the Developer ID certificate from the `release` environment (the same
secrets as the Resolve plugin), with hardened runtime and no entitlements. Bare binaries can't be
stapled: Gatekeeper checks the notarization online the first time a quarantined copy runs. Inside
the signed and stapled `.pkg`/`.dmg` installers that doesn't matter; for Premiere's `.ccx` test it
on a Mac that never ran PostPin.

## License

ffmpeg with x264 is GPL v2 or later, see `LICENSE.md`. The plugins run it as a separate program and
keep their own license.
