#!/usr/bin/env bash
# One-off: writes 1 s test clips per codec the minimal build must decode. Needs a FULL ffmpeg.
set -euo pipefail
FF=${FULL_FFMPEG:?path to a full ffmpeg build}
D=$(dirname "$0")/fixtures; mkdir -p "$D"
# Tiny on purpose, they are committed: 5 frames, 0.2 s of sound. Uncompressed codecs are big anyway.
V=(-f lavfi -i testsrc2=size=320x180:rate=25:duration=0.2)
A=(-f lavfi -i sine=frequency=440:duration=0.2)
e() { "$FF" -v error -y "$@"; }
e "${V[@]}" -c:v cfhd -pix_fmt yuv422p10le "$D/cfhd.mov"
e "${V[@]}" -c:v qtrle "$D/qtrle.mov"
e "${V[@]}" -c:v v210 "$D/v210.mov"
e "${V[@]}" -c:v r210 "$D/r210.mov"
e "${V[@]}" -c:v rawvideo -pix_fmt uyvy422 "$D/rawvideo.mov"
e "${V[@]}" -c:v hap "$D/hap.mov"
e "${V[@]}" -c:v jpeg2000 "$D/jpeg2000.mov"
e "${V[@]}" -c:v ffv1 "$D/ffv1.mkv"
e "${V[@]}" -c:v prores_ks "$D/prores.mov"
# DNxHD only knows broadcast sizes; one frame is enough
e "${V[@]}" -frames:v 1 -c:v dnxhd -s 1920x1080 -b:v 36M -pix_fmt yuv422p "$D/dnxhd.mov"
e "${V[@]}" -c:v libx264 "$D/h264.mp4"
e "${V[@]}" -c:v libx265 "$D/hevc.mp4"
e "${V[@]}" -c:v libvpx-vp9 "$D/vp9.mkv"
e "${V[@]}" -c:v mpeg2video "$D/mpeg2video.mxf"
e "${V[@]}" -c:v mjpeg "$D/mjpeg.mov"
for c in aac:aac.m4a mp3:mp3.mkv flac:flac.mkv libopus:opus.mkv ac3:ac3.mov eac3:eac3.mkv alac:alac.m4a pcm_s24le:pcm_s24le.wav pcm_s24be:pcm_s24be.aiff; do
  e "${A[@]}" -c:a "${c%%:*}" "$D/${c#*:}"
done
# rotated portrait and a source with cuts, for the selection and scene tests
# a display matrix, like phones write it: only a remux keeps it (-metadata rotate is gone since ffmpeg 7)
e -display_rotation 90 -i "$D/h264.mp4" -c copy "$D/rotated.mp4"
# a hard cut at 2 s (frame 50 at 25 fps)
e -f lavfi -i "testsrc2=size=320x180:rate=25:duration=2,format=yuv420p[a];color=red:size=320x180:rate=25:duration=1[b];[a][b]concat=n=2" \
  -c:v libx264 "$D/cuts.mp4"