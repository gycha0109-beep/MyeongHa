# FE031 — One-shot Sanitized Face Preview Analysis

## Purpose

FE031 composes the already bounded MyeongHa face-preview layers into a single ephemeral product operation:

```text
source Blob
→ FE030 intake / metadata strip
→ FE029 runtime bootstrap
→ FE026 neutral session
→ analyze canonical Blob
→ close session
→ neutral result only
```

This is the product-controller boundary immediately before UI wiring.

## Lifecycle

The original Blob is supplied only to FE030. The engine receives only FE030's canonical re-encoded Blob.

A ready FE026 session is closed after every analysis attempt. If cleanup fails after an otherwise successful analysis, FE031 fails closed with `SESSION_CLOSE_FAILED`.

Neither the source Blob nor the canonical Blob is returned in the FE031 result.

## Output

Success exposes only neutral metrics, region availability, and a bounded lifecycle receipt.

Rejection exposes only a bounded code/stage. Raw exceptions, engine module objects, runtime assets, model digest, provider trace, geometry, and image bytes are not returned.

## Boundary

FE031 performs no interpretation, classification, scoring, ranking, identity matching, production activation, or commerce activation. It does not consume Visually/FaceLab semantic outputs.
