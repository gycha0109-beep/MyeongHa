# FE030 — Privacy-safe Face Preview Image Intake

## Purpose

FE030 implements the Level-1 intake boundary required by the Face Reading architecture before a user image is passed to the neutral observation engine.

The boundary is intentionally semantic-free. It validates and sanitizes image bytes only.

## Intake contract

Accepted input:

- JPEG;
- PNG;
- WebP.

The declared MIME must match the file signature. Inputs are bounded to 16 MiB and 24 million decoded pixels.

Browser decode applies source orientation. The decoded pixels are then rendered into a fresh canvas and re-encoded as JPEG at quality 0.95. This canonical re-encode removes EXIF and other source metadata before engine analysis. The longest canonical edge is bounded to 4096 pixels while preserving aspect ratio.

These limits are operational intake guards, not physiognomy methodology or quality/calibration thresholds.

## Output

The success result contains only:

- the new canonical Blob;
- source/canonical byte counts;
- decoded/canonical dimensions;
- the source MIME;
- explicit privacy receipts stating metadata is not preserved, raw input is not persisted, and no identity embedding is created.

The original Blob is never stored by this module.

## Boundary

FE030 performs no face interpretation, classification, scoring, ranking, identity matching, production activation, or commerce activation. It consumes no Visually/FaceLab semantic output. Eligibility/pose/occlusion/one-face quality remain later observation-layer concerns.
