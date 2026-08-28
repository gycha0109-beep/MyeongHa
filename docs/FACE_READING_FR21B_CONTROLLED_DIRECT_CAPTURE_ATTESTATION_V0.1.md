# MyeongHa Face Reading FR-21B — Controlled Direct Capture Attestation v0.1

Status: research/design-only authority boundary
Scope: future browser/native controlled capture provenance and anatomical laterality calibration
Baseline: FR-19 capture orientation authority + FR-20 laterality consumption policy + FR-21A production promotion gate

## 1. Decision

FR-21B does **not** claim that MyeongHa or the pinned K_beauty commit currently owns a controlled camera contract.

Current repository state is intentionally:

```text
controlled capture contract = not_implemented
executed calibration evidence = 0
verified capture profiles = 0
production anatomical laterality = blocked
```

The purpose of FR-21B v0.1 is to define what evidence a future controlled capture implementation must supply before anatomical left/right can become an authority-bearing observation.

## 2. Why file upload is not enough

FR-19 established the upload canonicalization path:

```text
uploaded encoded bytes
→ Sharp autoOrient
→ EXIF-described rotate/flip applied to pixels
→ re-encode
→ canonical top-left image frame
```

That resolves metadata-described transforms. It does not prove whether source pixels were already mirrored before encoding.

Therefore none of the following establish anatomical laterality:

- selfie preview appearance,
- image x-order,
- provider LEFT/RIGHT symbols,
- a dependency or camera library name,
- ordinary gallery/file upload,
- EXIF normalization alone.

## 3. Future controlled capture profile provenance

A candidate profile must pin an actual implementation source:

```text
repository
repository commit SHA
source path
source blob SHA
camera facing
```

It must explicitly state, rather than infer:

```text
raw capture orientation
preview mirror policy relative to the subject target
saved-pixel mirror policy relative to the subject target
EXIF orientation policy
canonicalization transform
final canonical anatomical laterality assertion
```

Preview and saved pixels are distinct fields on purpose. A mirrored preview cannot be used as evidence that saved pixels are mirrored, and an unmirrored preview cannot be used as evidence that saved pixels are unmirrored.

The mirror policies are not trusted free-form declarations. For a verified profile they must match the asymmetric marker actually observed in the preview and encoded-pixel artifacts respectively.

## 4. Deterministic asymmetric calibration target

The required calibration target is `deterministic_asymmetric`.

The target must have a marker whose subject-coordinate left/right position is known before capture. The calibration record preserves the observed marker side at each stage:

```text
preview
raw_pixels
encoded_pixels
canonical_pixels
```

Each stage has an independent artifact evidence reference. Stage collapse is invalid.

The encoded EXIF Orientation value is also recorded as `1..8` or `null`.

The subject-relative mirror policy is derived as follows:

```text
marker anatomical side == observed image side
→ mirrored_relative_to_subject

marker anatomical side != observed image side
→ unmirrored_relative_to_subject
```

This comparison is performed separately for preview and encoded pixels.

## 5. Canonicalization and final anatomical assertion

FR-21B derives the final assertion from the known asymmetric marker and its position in **canonical pixels**.

Possible assertions are:

```text
image_left_is_subject_anatomical_left
image_left_is_subject_anatomical_right
```

A profile cannot simply declare one of these values. For `reviewState=verified`, referenced calibration evidence must:

1. belong to the same profile,
2. use the same camera facing,
3. contain all four capture stages,
4. use a deterministic asymmetric target,
5. be `reviewed`,
6. support the declared preview mirror policy,
7. independently support the declared saved-pixel mirror policy,
8. be consistent with the declared EXIF policy,
9. be consistent with identity/no-EXIF canonicalization cases that can be checked deterministically,
10. derive the same final anatomical assertion from canonical pixels.

For FR-19 Sharp auto-orientation with EXIF Orientation values that can encode a nontrivial transform, FR-21B does not guess the transformed side from metadata alone. The canonical artifact observation remains the evidence-bearing stage.

## 6. Current v0.1 authority remains closed

The repository constant is deliberately fixed to:

```text
controlledCaptureContractState = not_implemented
implementationRef = null
profileRefs = []
protocolState = design_only
calibration evidenceRefs = []
verifiedProfileRefs = []
finalAssertionRef = null
productionLateralityBindingAllowed = false
```

Standalone synthetic fixtures in tests only verify the schema and validator behavior. They are not inserted into the repository authority snapshot and cannot activate production laterality.

## 7. Prohibited promotions

FR-21B v0.1 explicitly rejects:

```text
preview → saved-pixel authority
provider side label → anatomical laterality
file upload → controlled capture attestation
design-only protocol → production laterality
unreviewed calibration → verified profile
```

It also rejects forged extra fields that attempt to smuggle provider-side or alternate authority declarations into a profile.

## 8. Relationship to FR-21A

FR-21A currently blocks every `production_authorized` definition requiring `anatomical_side` while trusted capture laterality is unresolved.

FR-21B v0.1 does not change that gate.

A future implementation phase must first create and verify a real capture implementation/profile and calibration evidence. Only then may a separate reviewed change consider connecting that verified capture authority to FR-21A production promotion.

This prevents a design document or schema from silently becoming production observation authority.

## 9. Non-goals

FR-21B does not:

- implement a browser or native camera,
- claim K_beauty MOBILE-5/6/7 are implemented,
- activate MediaPipe or FaceLab,
- resolve MediaPipe published-artifact provenance,
- authorize neutral derivation algorithms,
- create new traditional face-reading meaning,
- reinterpret provider landmarks as traditional regions,
- alter ordinary file-upload laterality.

## 10. Next evidence required

To move beyond v0.1, repository evidence must include an actual controlled capture implementation and pinned source provenance, followed by executed asymmetric calibration artifacts for supported camera-facing profiles.

Until that exists:

```text
FR-19 ordinary upload mirror state = unresolved
FR-20 anatomical-side consumption = blocked
FR-21A anatomical-side production promotion = blocked
FR-21B production laterality binding = blocked
```
