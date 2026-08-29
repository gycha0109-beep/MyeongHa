# FR-DATA-02 — Encoded Image Dimension Verification

## Purpose

FR-DATA-02 strengthens the FR-DATA-01 intake path by deriving image width and height directly from supplied PNG/JPEG/WebP bytes and requiring exact equality with the FR-47 capture manifest.

This is data-provenance tooling only. It does not add anatomical, traditional, or production authority.

## Supported byte structures

The parser recognizes dimensions from:

- PNG: first `IHDR` chunk (`png_ihdr`)
- JPEG: supported Start Of Frame markers before SOS (`jpeg_sof`)
- WebP extended container: `VP8X` canvas (`webp_vp8x`)
- WebP lossless: `VP8L` coded dimensions (`webp_vp8l`)
- WebP lossy: `VP8 ` frame header (`webp_vp8`)

Malformed/truncated headers, missing JPEG SOF, invalid WebP RIFF/chunk bounds, zero dimensions, or unsupported signatures fail closed.

## Relationship to FR-DATA-01

FR-DATA-02 first runs the existing FR-DATA-01 asset verification, so every file must already satisfy:

- exact capture-to-asset coverage
- root confinement after realpath/symlink resolution
- regular-file requirement
- exact SHA-256 equality
- PNG/JPEG/WebP signature recognition

FR-DATA-02 then parses the verified bytes and compares encoded dimensions against `capture.imageWidth` / `capture.imageHeight` in the FR-47 manifest.

## Usage

```bash
npm run build
node scripts/face-reading-fr-data02-image-dimensions.mjs \
  path/to/intake-manifest.json \
  path/to/asset-root \
  artifacts/face-reading/fr-data02-image-dimensions.json
```

Success emits `FR_DATA_02_DIMENSIONS` and optional `fr-data02-image-dimensions-v1` JSON.

## Exact claim boundary

A successful FR-DATA-02 report may set:

- `imageByteHeaderStructureVerified = true`
- `imageDimensionsVerifiedAgainstBytes = true`

It still keeps:

- `imageDecodabilityVerified = false`
- `pixelContentIntegrityVerified = false`
- `empiricalScoringPerformed = false`
- provider→Menton mapping = false
- repeatability / pose stability = false
- calibration thresholds = false
- FR-35 contour relation = false
- traditional `地閣` equivalence = false
- research candidate admission = false
- production geometry = false

Header parsing does not prove that the entire image bitstream can be decoded, that pixels are visually meaningful, that the face is usable, or that any neutral/traditional landmark identity is correct.

## Why this matters

FR-47 records image dimensions as capture provenance. Before FR-DATA-02 those values were structurally validated but still self-reported. FR-DATA-02 makes the dimensions byte-derived and deterministic without pretending that a header-level parser is a full image decoder.
