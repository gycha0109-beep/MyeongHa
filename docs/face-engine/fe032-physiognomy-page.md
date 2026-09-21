# FE032 — Standalone Physiognomy Page

## Product placement

Physiognomy is a first-class MyeongHa menu/page surface. It is not a Saju sub-page and is not introduced as a Home card.

The page entry is `face-reading.html`, backed by its own React entry and `MHA-PHYSIOGNOMY-PAGE-API-FE032-v1`.

## UI flow

1. camera/gallery file selection;
2. local object-URL preview only;
3. explicit user action to start analysis;
4. FE031 performs FE030 sanitization and bounded one-shot observation;
5. FE032 projects the result into page-safe readiness/rejection states.

Object URLs are revoked when replaced/unmounted.

## Page API boundary

The page API deliberately removes neutral metric values and metric refs. UI success exposes only counts of available/partial observation regions plus privacy receipts.

No source/canonical image, runtime assets, provider trace, geometry, model digest, interpretation, classification, ranking, production authority, or commerce authority crosses the page API.

## Engine delivery

FE029 intentionally leaves accepted FE023 package distribution injected. FE032 preserves that boundary. The browser page expects an injected `window.__MHA_FACE_PREVIEW_ENGINE_LOADER_FE032__` function; absence/failure becomes the existing bounded engine rejection.

A later distribution unit must supply the accepted engine module. FE032 does not duplicate Saju package source or invent an unverified browser bundle.

## Interpretation

A successful FE032 run means only that neutral observation completed. Physiognomy meaning/claims remain a later methodology/claim authority layer.
