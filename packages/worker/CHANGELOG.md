# @postpin-io/worker

## 0.6.0

### Minor Changes

- feat: live markers – marker, response and category changes from other reviewers and tabs appear without reloading

## 0.3.0

### Minor Changes

- **4K review versions**: Exports from 4K sources get a 2160p version, and no version is larger than the original.
- **Review versions from the plugins**: The plugins now encode the review versions themselves. The server checks each one and encodes it again when it doesn't meet the requirements.
- **Cuts and markers from EDL and XML**: Reads cuts and markers from uploaded EDL and FCPXML files.

## 0.2.1

### Patch Changes

- **Cut detection for browser uploads**: Detects the cuts in exports uploaded in the browser, with an adjustable sensitivity.

## 0.2.0

### Minor Changes

- **Faster processing**: All review versions (1080p, 720p, 480p) are encoded in a single pass over the original, so exports are ready sooner.

## 0.1.0

### Minor Changes

- **First release**: Turns uploaded exports into streamable review versions and creates seek previews, the movie barcode and a thumbnail per shot.
