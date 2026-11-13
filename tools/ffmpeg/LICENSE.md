# ffmpeg in PostPin

The PostPin plugins (PostPin Desktop, the DaVinci Resolve plugin and the Premiere Pro plugin) ship
`ffmpeg` and `ffprobe` to encode review versions on the editor's machine. They are a minimal build
made from these sources, without changes:

| Component | Version                                    | License                         | Source                                          |
| --------- | ------------------------------------------ | ------------------------------- | ----------------------------------------------- |
| FFmpeg    | 9.0.2                                      | GNU GPL v2 or later (with x264) | https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz |
| x264      | `b35605ace3ddf7c1a5d67a2eb553f034aef41d55` | GNU GPL v2 or later             | https://code.videolan.org/videolan/x264         |
| zlib      | 1.3.1 (Windows only)                       | zlib license                    | https://github.com/madler/zlib                  |

Because the build includes x264 (`--enable-gpl --enable-libx264`), `ffmpeg` and `ffprobe` as a whole
are licensed under the **GNU General Public License, version 2 or later**. The full text is at
https://www.gnu.org/licenses/old-licenses/gpl-2.0.html and in `COPYING.GPLv2` of the FFmpeg source.

## Source code

The exact source archives these binaries were built from are attached to the same GitHub release as
the binaries (`source-ffmpeg.*`, `source-x264.*`, `source-zlib.*`), next to `SHA256SUMS`:
https://github.com/PostPin-io/postpin/releases?q=ffmpeg-v

The scripts that build them, including every configure option, are in the PostPin repository under
[`tools/ffmpeg/`](https://github.com/PostPin-io/postpin/tree/main/tools/ffmpeg). `BUILDCONF.txt`
next to the binaries lists the configuration of this particular build.

## Relation to PostPin

The plugins run `ffmpeg` and `ffprobe` as separate programs and talk to them only through command
line arguments, files and pipes. They don't link against FFmpeg, so the GPL applies to these two
binaries and not to the plugins, which keep their own license.

FFmpeg is a trademark of Fabrice Bellard, the originator of the FFmpeg project. PostPin is not
affiliated with the FFmpeg or x264 projects.
