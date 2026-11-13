# Web Upload

Besides the editing plugins, members can upload a video file straight from the browser: the
upload button next to "Your Exports" of a timeline. Reviewers don't see it, and the server refuses
their uploads.

The plugins remain the recommended way, so the button first points to
[the downloads](https://docs.postpin.io/downloads). A plugin uploads the real timeline with its
clips, names and timecode; a web upload gets an **estimated** timeline instead.

## What the browser reads

The file is checked before anything is uploaded. MP4, MOV and WebM with H.264, HEVC, ProRes or VP9
are read in the browser (with [mediabunny](https://mediabunny.dev), only the parts of the file it
needs, so this takes well under a second even for files of many GB):

- length, resolution and frame rate. The measured rate is rounded to the nearest standard rate
  (23.976, 24, 25, 29.97, 30, 50, 59.94, 60). If it is far off every one of them, typically a
  phone video with a variable frame rate, the form asks to check it.
- the start timecode, from the QuickTime timecode track of MOV and MP4 files, including
  drop-frame.

MXF files are allowed too, but nothing can be read from them in the browser: the form leaves frame
rate and start timecode empty, and the worker fills them in after the upload.

Everything the form prefills is marked _estimated_ and can be changed. Values the uploader changed
are kept; all others are replaced by what `ffprobe` finds once the file is uploaded.

## Uploading

The file goes straight to S3 in parts (4 at a time), using presigned URLs like the plugins. The
upload keeps running while the user moves around in PostPin, and the browser asks before the tab
is closed. If the upload is interrupted, e.g. by a reload or a lost connection, the export list
offers **Resume**: choosing the same file again uploads only the parts that are missing.

`UPLOAD_MAX_FILE_SIZE` limits the size of a single file, and the storage quotas apply as for the
plugins. The browser checks both before uploading.

## Cut detection

After the upload, the worker probes the file and, if "Detect cuts" was on, looks for cuts:
`ffmpeg` with the `scene` filter at 320 px width. It stores every picture change with a score of
at least 0.1, so the sensitivity can be changed later without analysing the video again:

| Sensitivity | Threshold |
| ----------- | --------- |
| Sensitive   | 0.2       |
| Medium      | 0.3       |
| Insensitive | 0.45      |

Shots shorter than half a second are not split off, so a flash or a dissolve doesn't count as
several cuts. In the review, the _Estimated_ badge under the video explains this and lets members
switch the sensitivity or turn the cuts off ("No cuts": one clip for the whole video).
