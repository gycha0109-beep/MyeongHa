# FE033 — Face Preview Engine Delivery

FE033 closes the remaining package-delivery gap between the standalone MyeongHa physiognomy page and the verified Saju Face Engine.

## Producer pin

The consumer is pinned to the immutable Saju materialization commit:

- producer materialization: `1f80c30f5c829ce8d0d839cdd5816dad943c5afd`
- FE024 source provenance: `1c0be383844bd7c5aa75079e2084da7bee9de13c`
- package: `@myeongha/face-reading@0.0.0`
- tarball SHA-256: `8d793c57e104fc0137a17dc631d208b468131b1d9a9668142a846e34dacbf84a`
- public package entry: `@myeongha/face-reading/preview-engine`
- MediaPipe: `0.10.35`

The package is consumed from the commit-addressed producer tarball. It is not registry-published and MyeongHa does not copy Saju source.

## Browser boundary

`engine-loader-fe033.ts` dynamically imports the public preview-engine package and immediately projects it down to the exact FE023 contract/open function required by FE029. Earlier preview contracts and internal runtime modules are not exposed to the page.

FE032's temporary `window.__MHA_FACE_PREVIEW_ENGINE_LOADER_FE032__` injection is removed. The page now passes `loadFacePreviewEngineFE033` directly into the existing FE032 API → FE031 one-shot → FE029 bootstrap chain.

## Integrity gate

The FE033 verifier checks:

1. exact immutable tarball URL in the web package and lockfile;
2. exact lockfile SHA-512 and MediaPipe 0.10.35;
3. producer manifest schema, FE024 source provenance, FE023 contract and distribution boundary;
4. producer tarball SHA-256;
5. installed package export map;
6. public preview-engine import;
7. blocked root/internal package imports.

FE027/FE028 remain authoritative for model/WASM web assets. FE033 does not add interpretation, classification, ranking, persistence, identity, production, or commerce authority.
