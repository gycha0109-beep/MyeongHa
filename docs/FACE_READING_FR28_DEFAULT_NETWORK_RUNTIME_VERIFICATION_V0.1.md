# Face Reading FR-28 — Default Network Runtime Verification v0.1

## 1. Scope

FR-28 verifies the existing FR-26 MediaPipe FaceLandmarker **default runtime factory** in a real browser without injecting a replacement runtime factory.

The verified research execution chain is:

`in-memory canonical fixture → FR-26 default factory → @mediapipe/tasks-vision@0.10.35 → FR-26 jsDelivr WASM reference → FR-26 GCS model reference → FaceLandmarker.detect() → FR-25 → FR-24`

FR-28 is verification evidence only. It does not grant provider conformance, production activation, anatomical laterality, or traditional physiognomy semantic authority.

## 2. Default factory boundary

The browser calls:

`runMediaPipeEyePairResearchFR26(request)`

with no second `factory` argument. Therefore the existing `DEFAULT_MEDIAPIPE_FACE_LANDMARKER_RUNTIME_FACTORY_FR26` creates and closes the MediaPipe runtime.

The browser harness uses an import map to resolve the bare package specifier `@mediapipe/tasks-vision` to the exact installed `0.10.35` bundle. This models package resolution only; it does not replace the FR-26 runtime factory and does not claim any future production bundler output is identical.

## 3. WASM reference verification

Before browser execution, the harness downloads all six files under the exact FR-26 root:

`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`

Each remote SHA-256 is compared against the exact installed package file SHA-256 already pinned by FR-27. All six files matched byte-for-byte in the hardened evidence run.

Chrome selected:

- `vision_wasm_internal.js`
- `vision_wasm_internal.wasm`

The selected files are a runtime observation for the pinned Chrome execution; the full six-file equality check is the reference-root byte evidence.

## 4. Model reference verification

The exact FR-26 model URL was downloaded and independently hashed:

`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

Verified SHA-256:

`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Verified byte length: `3,758,596`.

## 5. Real browser result

Hardened evidence run: GitHub Actions workflow run `33142936129`.

The exact FR-26 default factory was executed twice with the same 640×640 official MediaPipe fixture.

Observed result:

- deterministic replay: true
- research regions: 2
- boundary vertices: 16 + 16
- side authority: `provider_label_only`
- consumer slot assignment: `null`
- production neutral observation issued: false
- production provider activation allowed: false
- anatomical laterality resolved: false
- traditional semantic authority: false

Evidence artifact:

- artifact ID: `9674675558`
- ZIP SHA-256: `95b3a939c363424f9c820769edd0e38f3df7c36bd6d35ed962cfce3728235471`

## 6. Bounded network observation

CDP network observation captured only the following external GET classes during the measured execution:

- jsDelivr WASM loader: 1 request
- jsDelivr WASM binary: 2 requests
- GCS model: 2 requests

All observed external responses were 2xx. The hardened gate rejects any external request outside the pinned WASM/model allowlist.

This is a bounded runtime observation, not proof that MediaPipe never emits telemetry. The harness observes one second after the second replay and explicitly records `telemetryAbsenceClaimed=false`. MediaPipe Tasks production privacy/metrics review remains mandatory before provider activation.

## 7. Authority boundary

FR-28 does not change these states:

- FR-22 verified provider implementation registry: empty
- FR-23 reviewed provider conformance evidence registry: empty
- production provider activation: false
- anatomical laterality: unresolved
- traditional physiognomy semantic authority: false
- raw image persistence: false
- raw provider response persistence: false
- biometric embedding persistence: false

FR-22 still requires the complete neutral provider capability/slot contract. The currently executable MediaPipe research path only projects the FR-24 eye pair and cannot be promoted into the six-slot production provider contract.

## 8. Remaining blockers

1. FR-18 lockfile evidence does not establish release-exact upstream source-code equivalence for `@mediapipe/tasks-vision@0.10.35`.
2. The package bundle is resolved in the browser harness through an import map to the exact installed bundle; future production bundler output is not attested by FR-28.
3. The bounded network observation cannot establish global telemetry absence or satisfy privacy/consent review.
4. FR-22 full six-slot verified implementation evidence is absent.
5. FR-23 reviewed conformance evidence is absent.
6. Provider LEFT/RIGHT labels do not establish anatomical laterality.
7. No traditional face-reading meaning is authorized by FR-28.
