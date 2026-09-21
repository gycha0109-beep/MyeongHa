# FE027 — Face Preview Runtime Asset Staging

## Purpose

FE027 establishes a reproducible, same-origin browser asset boundary for the FE023/FE026 Face Preview runtime.

The initial probe recorded the exact upstream bytes. The locked manifest now pins SHA-256 and byte size for the Face Landmarker model and all six MediaPipe browser WASM loader/binary files.

## Locked upstreams

- Face Landmarker float16 version 1 task bundle from the official MediaPipe model bucket.
- Browser runtime files from the version-pinned `@mediapipe/tasks-vision@0.10.35` jsDelivr package path.
- No `latest` aliases.

The model digest locked by FE027 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

## Staging

`scripts/stage-face-preview-runtime-assets-fe027.mjs` downloads each pinned source, rejects HTTP failures, verifies exact byte size and SHA-256, and only then writes the bytes into a staging root.

The resulting browser paths are:

- WASM root: `/face-preview/mediapipe/0.10.35/wasm`
- model: `/face-preview/models/face_landmarker.float16.v1.task`

It also emits `/face-preview/runtime-assets.json`, containing only the FE022 engine asset config and a build-verification receipt.

The staging root is not automatically attached to the production web build in FE027. That distribution wiring is intentionally left to the next bounded integration unit.

## Boundary

FE027 handles runtime program/model assets only. User image bytes are never part of the manifest or staging tree.

No identity embedding, interpretation, classification, ranking, production authority, or commerce authority is introduced.
