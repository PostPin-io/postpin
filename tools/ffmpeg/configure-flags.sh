# Sourced by build.sh. Everything ffmpeg can do is off, only what the plugins use is on.
# configure accepts unknown names WITHOUT a warning: every entry here needs a fixture in test/.
COMMON_FLAGS=(
  --enable-gpl --enable-libx264 --enable-zlib
  --enable-static --disable-shared
  --disable-everything --disable-autodetect --disable-network
  --disable-doc --disable-debug --disable-ffplay
  --enable-ffmpeg --enable-ffprobe
  --enable-protocol=file,pipe
  --enable-demuxer=mov,matroska,mxf,avi,wav,aiff,mpegts,image2,ac3,eac3,flac
  --enable-decoder=h264,hevc,prores,dnxhd,cfhd,qtrle,v210,r210,rawvideo,hap,jpeg2000,ffv1,mjpeg,mpeg2video,mpeg4,vp9,av1,aac,mp3,alac,flac,opus,ac3,eac3,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_s16be,pcm_s24be,pcm_s32be
  --enable-parser=h264,hevc,aac,ac3,flac,opus,mpegaudio,mpeg4video,vp9,av1
  # wrapped_avframe: needed by "-f null" (scene detection), otherwise ffmpeg exits with "Encoder not found"
  --enable-encoder=libx264,aac,mjpeg,png,rawvideo,wrapped_avframe,pcm_s16le
  --enable-muxer=hls,mp4,mov,null,image2pipe,rawvideo
  --enable-filter=split,scale,pad,format,aformat,aresample,atrim,asetpts,null,anull,select,metadata,scdet,tile,fps,crop,hflip,vflip,transpose,rotate,setsar
  --enable-bsf=h264_mp4toannexb,aac_adtstoasc,extract_extradata
)

MACOS_FLAGS=(
  --enable-videotoolbox --enable-audiotoolbox
  --enable-encoder=h264_videotoolbox,hevc_videotoolbox
  --enable-hwaccel=h264_videotoolbox,hevc_videotoolbox,prores_videotoolbox
)

# --disable-autodetect also turns these off; without w32threads ffmpeg would run single-threaded
WINDOWS_FLAGS=(
  --enable-w32threads
  --enable-d3d11va --enable-dxva2
  --enable-hwaccel=h264_d3d11va,hevc_d3d11va,h264_dxva2,hevc_dxva2
)