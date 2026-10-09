# FE025 — Face Preview Handoff Acceptance

## Purpose

FE025 is the first MyeongHa-side gate for the Saju face-preview package.

It does not add Face Lab UI. It verifies that a specifically pinned Saju FE024 workflow run produced the exact digest-bound FE023 consumer package that MyeongHa is willing to accept.

## Invocation

The manual workflow requires:

- the successful Saju FE024 workflow run ID;
- the exact Saju source HEAD SHA expected in both workflow provenance and the FE024 manifest.

The workflow locates exactly one non-expired `fe024-digest-bound-preview-consumer-handoff` artifact, downloads it, and runs the MyeongHa-side verifier.

For cross-repository Actions API access, `SAJU_HANDOFF_READ_TOKEN` may be configured with read-only access to Saju Actions. The workflow falls back to the current repository token when GitHub permits public cross-repository artifact reads.

## Acceptance checks

The verifier checks:

- manifest source commit equals the pinned Saju HEAD;
- tarball SHA-256;
- package name/version/private flag and `./preview-engine` boundary;
- FE023 contract and public open function;
- FE023/FE022 runtime configuration obligations;
- required model SHA-256 and explicit unverified WASM-byte boundary;
- `@mediapipe/tasks-vision@0.10.35`;
- isolated install/import;
- blocked root/internal package paths.

## Boundary

This gate does not persist images, add identity embeddings, interpret faces, classify/rank people, or activate production/commerce behavior. It only accepts or rejects a package handoff.
