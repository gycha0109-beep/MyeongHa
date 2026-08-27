# Face Reading FR-19 — Capture Orientation Authority v0.1

> Project: MyeongHa
> Scope: canonical image orientation vs anatomical mirror/laterality authority
> Authority state: research-only
> Date: 2026-08-27

## 1. Why FR-19 exists

FR-18 separated provider package/source provenance from left/right capture semantics, but the capture side was still one unresolved blocker.

Inspection of the pinned `K_beauty` image boundary shows a useful distinction:

```text
EXIF-described orientation transform
!=
unknown mirror state already baked into source pixels
```

The first can be resolved by canonicalization.
The second cannot be inferred from an uploaded file alone.

FR-19 encodes that distinction as authority rather than treating all "orientation" problems as one boolean.

## 2. Exact inspected source

Pinned source:

```text
repository  = gycha0109-beep/K_beauty
commit      = 81c3b4139efdffc785439da005557dc38a6b4873
path        = lib/image-upload-boundary-core.js
blob        = 2215b9c08f61971521ae9ff9eab9cb7c5f392f98
sharp       = 0.35.3
```

The canonicalization path:

```text
encoded bytes
→ signature/format validation
→ decoded metadata validation using oriented dimensions
→ sharp(...).autoOrient()
→ re-encode as JPEG / PNG / WebP
→ canonical bytes
```

No face semantics are created here.

## 3. What `autoOrient` closes

Sharp's `autoOrient()` contract applies the EXIF `Orientation` transform to pixels. The operation can include rotation and mirror transforms and removes the orientation tag. Buffer output removes metadata by default unless metadata retention is explicitly requested.

Therefore FR-19 may state:

```text
canonicalPixelOrientationState = exif_transform_normalized
outputOrientationMetadataRetained = false
```

This closes the ambiguity represented by EXIF orientation metadata.

## 4. What `autoOrient` does NOT close

A source image may already contain mirrored pixel content before encoding.

Examples:

```text
front-camera application saves mirrored pixels
user mirrors an image before upload
platform capture pipeline applies a display transform into encoded pixels
third-party editor exports horizontally flipped pixels
```

If the final encoded bytes have no trusted acquisition provenance stating this transform, `autoOrient()` cannot recover the original anatomical orientation.

Therefore:

```text
sourcePixelMirrorState = unresolved_source_pixels
fileUploadCanEstablishAnatomicalUnmirroredPixels = false
```

## 5. Preview is not evidence

A selfie preview may be mirrored while the saved image is not, or vice versa.

FR-19 therefore forbids:

```text
what the preview looked like
→ saved pixel anatomical orientation
```

A future direct-camera acquisition contract must attest the exact sensor/capture/canonical transform independently of UI preview rendering.

## 6. Coordinate frame is image-space only

Canonical image coordinates may be described as:

```text
origin = top_left
x      = image_left_to_right
y      = image_top_to_bottom
```

These are geometric directions only.

Forbidden:

```text
small x = anatomical left
large x = anatomical right
```

without capture/laterality authority.

## 7. Provider left/right cannot bypass capture authority

FR-18 preserves MediaPipe provider symbols such as:

```text
FACE_LANDMARKS_LEFT_EYE
FACE_LANDMARKS_RIGHT_EYE
```

FR-19 does not allow those names to solve an unresolved capture transform.

```text
provider-side label
!=
trusted acquisition/canonicalization laterality provenance
```

This prevents a provider topology convention from silently becoming product anatomical authority.

## 8. Relationship to FR-18

FR-19 closes exactly one FR-18 gap:

```text
closesCaptureExifTransformGap = true
```

It explicitly does not close:

```text
closesPublishedBundleProvenanceGap = false
closesAnatomicalMirrorGap = false
providerActivationAllowed = false
```

The provider bridge therefore remains blocked.

## 9. Negative tests

FR-19 fails closed against:

- inspected source/blob drift;
- changing the Sharp version without a new authority revision;
- claiming source pixels are anatomically unmirrored;
- treating selfie preview orientation as saved-pixel authority;
- treating image x-order as anatomical side;
- allowing provider left/right names to bypass capture provenance;
- smuggling provider/camera index material into the laterality contract;
- pretending FR-19 resolves FR-18 published-artifact provenance.

## 10. Next work

The clean next split is:

### FR-20A — Direct Capture Transform Contract

For a future controlled browser/native camera path, define:

```text
raw capture orientation
front/rear camera
preview mirroring policy
saved-pixel mirroring policy
EXIF orientation policy
canonicalization transform
final anatomical laterality assertion
```

with deterministic asymmetric test targets.

### FR-20B — File Upload Laterality Policy

Decide whether ordinary gallery/file uploads:

```text
A. remain bilateral/laterality-limited for side-specific claims
or
B. require user confirmation/capture recapture before side-specific modules activate
```

No silent inference.

### FR-20C — Published Provider Artifact Provenance

FR-18 package topology provenance remains independent and unresolved.

## 11. Final invariant

```text
EXIF orientation normalized
!=
anatomical left/right proven

canonical image x-axis
!=
anatomical side

preview mirroring
!=
saved-pixel transform

provider left/right naming
!=
capture provenance
```
