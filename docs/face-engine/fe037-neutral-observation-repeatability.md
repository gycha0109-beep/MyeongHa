# FE037 — Real Browser Neutral Observation Repeatability Evidence

Watchtower-Track: face-reading

## Purpose

FE037 measures exact-input repeatability of the real browser observation path after FE034 proved a successful FaceLandmarker execution.

The measured path is the existing production one-shot chain:

`FE031 image intake -> FE029 runtime bootstrap -> FE023 digest-bound engine -> FE022 MediaPipe model -> FE026 consumer-safe neutral projection`.

FE037 does not create a quality or calibration threshold.

## Fixture

The same non-user fixture admitted by FE034 is reused:

- repository: `scikit-image/scikit-image`
- commit: `9311ab50b2e3392bb5272253b43cb4dd1ce04e31`
- path: `src/_skimage2/data/astronaut.png`
- Git blob: `834cda0012478c5edc8d43bade96d315dedeaab4`
- SHA-256: `88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5`

CI fails before browser execution if the fixture bytes do not match the pinned digest.

## Method

The browser harness is generated into a temporary directory during verification. No test-only hook is added to the product page or public runtime API.

For one fixed source blob, the harness performs five independent calls through `runFacePreviewOneShotFE031`.

Every run therefore repeats image intake, engine bootstrap, analysis, and session close through the real production modules.

The harness requires:

- every run to succeed;
- metric identity/order to remain structurally identical;
- region availability and unavailable-surface structure to remain identical;
- every run to close its session;
- existing no-persistence/no-identity lifecycle boundaries to remain intact.

## Numeric evidence

For every neutral metric, FE037 records:

- baseline value;
- all five observed values;
- maximum absolute delta from baseline;
- mean absolute delta from baseline;
- exact-equality count.

No maximum acceptable delta is defined.

Numeric variation is evidence only. It does not become:

- stability PASS/FAIL;
- capture-quality PASS/FAIL;
- calibration authority;
- semantic authority;
- a classifier or score.

## CI consolidation

FE037 is integrated into the shared `Web Browser Smoke` workflow.

The former FE034 one-off workflow is removed. The FE034 single-run canary remains executed as a step in the shared browser workflow before FE037 repeatability evidence is collected.

The JSON evidence artifact is uploaded with the shared browser diagnostics.

## Boundary

FE037 uses only the pinned non-user fixture and exposes no raw landmark geometry or identity representation.

It does not modify the product runtime API and does not widen the standalone physiognomy page contract.
