# FE029 — Face Preview Browser Runtime Bootstrap

## Purpose

FE029 connects the deployed FE028 runtime asset configuration to the bounded FE026 consumer adapter.

Package distribution remains injected: FE029 does not decide how the accepted FE023 module is delivered. That keeps cross-repository package provenance separate from browser runtime configuration.

## Flow

1. fetch exactly `/face-preview/runtime-assets.json` with same-origin credentials;
2. require the FE027 contract/version and exact locked FE022 asset configuration;
3. require both model and WASM build-verification receipts;
4. load the preview-engine module through the injected loader;
5. enforce the exact FE023 contract and top-level open envelope;
6. delegate to FE026.

Fetch, JSON, module-loader, or contract drift fails closed into the existing bounded consumer rejection shape. Raw exceptions are never returned.

## Boundary

FE029 accepts no Skin Match survey/score/product state and no user image. It does not add camera UI, persistence, identity embeddings, interpretation, classification, ranking, production authority, or commerce authority.
