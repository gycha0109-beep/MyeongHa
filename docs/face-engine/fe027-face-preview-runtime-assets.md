# FE027 — Face Preview Runtime Asset Staging

## Goal

FE027 establishes a reproducible, same-origin browser asset boundary for the FE023/FE026 Face Preview runtime.

The first phase probes the exact bytes from pinned upstream locations and records SHA-256 plus byte size. Those values are then locked into the staging manifest before the staging implementation is considered complete.

## Pinned upstreams

- Face Landmarker: float16 version 1 task bundle from the official MediaPipe model bucket.
- Browser runtime: the six WASM loader/binary files exposed by `@mediapipe/tasks-vision@0.10.35`, fetched from the version-pinned jsDelivr package path.

No `latest` aliases are used.

## Final staging boundary

The completed FE027 unit must verify every downloaded byte against the locked manifest before writing into the web output tree. FE026 will receive only same-origin runtime paths and the expected model SHA-256.

User image bytes are unrelated to this staging path and are never written by FE027.
