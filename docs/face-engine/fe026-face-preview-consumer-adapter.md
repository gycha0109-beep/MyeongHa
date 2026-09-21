# FE026 — Bounded Web Consumer Adapter

## Purpose

FE026 adds the first MyeongHa web-side runtime adapter for the accepted Saju FE023 preview session.

It deliberately does not solve package distribution or add camera UI. The engine module is injected by a later distribution/wiring layer.

## Boundary

The adapter accepts only:

- the exact FE023 contract version;
- the public `openDigestBoundProductPreviewSessionFE023` function;
- FE022 asset configuration containing WASM root, model path, and expected model SHA-256.

The returned MyeongHa session exposes only `analyze(blob)` and `close()`.

Successful analysis projects only neutral metrics and the four ordered region-availability records. Engine transport receipts, runtime factories, asset references, model digest, provider trace, and geometry remain outside the MyeongHa consumer result.

Malformed or widened upstream payloads fail closed as `ENGINE_CONTRACT_MISMATCH`.

## Product separation

Face Preview remains image-first. FE026 does not accept Skin Match survey state, score, priority axes, current products, or recommendation output.

It performs no interpretation, classification, ranking, production activation, or commerce activation, and it does not persist the input Blob or create identity embeddings.
