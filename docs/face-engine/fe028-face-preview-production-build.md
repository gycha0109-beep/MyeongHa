# FE028 — Face Preview Production Web Build Attachment

## Purpose

FE028 attaches the digest-locked FE027 Face Preview runtime assets to the real MyeongHa production web build.

`npm run build:web` now performs the governed static copy, stages FE027 assets directly into the governed `public` deployment output, verifies every staged byte, and then runs the Vite build with `emptyOutDir: false` so the verified Face Preview tree is preserved.

## Deployment paths

- `/face-preview/runtime-assets.json`
- `/face-preview/models/face_landmarker.float16.v1.task`
- `/face-preview/mediapipe/0.10.35/wasm/*`

The staging manifest remains the authority for exact upstream URL, byte size, and SHA-256.

## Browser runtime bridge

`runtime-config-fe028.ts` fetches only the same-origin runtime config path. It fails closed unless:

- the FE027 runtime identity is exact;
- the WASM root and model path are the pinned same-origin paths;
- the model SHA-256 is the pinned FE027 digest;
- both model and WASM build-verification receipts are true;
- user-image bytes are explicitly absent.

The bridge returns only the FE022 asset config needed to create the FE026 consumer config. It does not expose the FE027 verification receipt to the consumer session.

## Production-build smoke

The FE028 smoke checks the final `public` tree after `npm run build:web`, serves that exact output over a local HTTP server, and verifies that runtime config, model, and all six WASM assets are fetchable. WASM responses are checked as `application/wasm`.

## Boundary

FE028 does not add camera UI, store user images, create identity embeddings, interpret or classify a face, rank a person, or activate production/commerce authority. It only makes the already bounded FE023/FE026 runtime assets deployable.
