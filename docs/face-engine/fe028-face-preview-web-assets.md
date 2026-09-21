# FE028 — Face Preview Assets in Web Build

## Purpose

FE028 attaches FE027's digest-locked Face Preview runtime assets to the normal MyeongHa web build.

The web build now uses one output-root contract across static copy, runtime-asset staging, and Vite output. The default remains `public/`; CI can isolate the output with `MYEONGHA_WEB_OUTPUT_DIR`.

## Build order

1. reset/copy static web files;
2. fetch and SHA-256/size verify the seven FE027 runtime assets;
3. stage the verified bytes plus `face-preview/runtime-assets.json`;
4. run the Vite build with `emptyOutDir: false`, preserving the staged runtime tree.

The runtime tree contains only:

- `face-preview/models/face_landmarker.float16.v1.task`;
- six `@mediapipe/tasks-vision@0.10.35` WASM loader/binary files;
- `face-preview/runtime-assets.json`.

## Verification

The FE028 gate builds into an isolated output directory, recomputes every staged SHA-256, verifies exact file sets and runtime config, and confirms the normal web index output exists.

No user image is part of the build artifact. This unit still does not wire Face Lab UI or load the FE023 package at runtime.
