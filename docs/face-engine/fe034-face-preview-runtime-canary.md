# FE034 — Real Browser FaceLandmarker Canary

## Purpose

FE034 proves that the production MyeongHa web build can execute the real Face Preview path end to end:

`FE032 page -> FE031 one-shot -> FE029 bootstrap -> FE023 -> FE022 -> MediaPipe FaceLandmarker -> neutral observation`.

This is a runtime proof only. It does not add physiognomy interpretation, classification, ranking, identity matching, persistence, production authority, or commerce authority.

## Fixture provenance

The canary uses the public scikit-image astronaut image only as test data.

- repository: `scikit-image/scikit-image`
- source commit: `9311ab50b2e3392bb5272253b43cb4dd1ce04e31`
- path: `src/_skimage2/data/astronaut.png`
- Git blob: `834cda0012478c5edc8d43bade96d315dedeaab4`
- byte size: `791555`
- SHA-256: `88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5`

CI downloads the fixture from the immutable commit and fails closed unless the exact SHA-256 matches.

## Browser proof

The canary builds the production web output, serves it locally, launches headless Chrome, opens `face-reading.html`, injects the pinned fixture through the gallery file input, and activates the same user-facing analysis button used by FE032.

Success requires the real page to reach the ready result rather than a mocked engine response.

Verified canary result on run `35629570124`:

- real engine package: true
- real runtime assets: true
- FaceLandmarker observation succeeded: true
- available observation regions: 3
- partial observation regions: 1
- user image persistence added: false
- identity embedding added: false

## Boundary

The fixture exists only in the CI runner temporary directory and the temporary local HTTP test server. FE034 does not add a product image storage path. The page continues to expose only the bounded FE032 observation summary, not raw landmarks, geometry, provider traces, or interpretation claims.
