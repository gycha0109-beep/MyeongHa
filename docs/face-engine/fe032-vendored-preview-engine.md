# FE032 — Vendored Accepted Face Preview Engine

## Purpose

FE032 closes the browser module-delivery gap left intentionally open by FE029.

The accepted FE024 package is materialized into MyeongHa as a digest-pinned vendor artifact rather than published to a registry. MyeongHa then installs that exact tarball and exposes a loader that returns only the FE023 public contract required by FE029/FE031.

## Pinned provenance

- Saju source commit: `1c0be383844bd7c5aa75079e2084da7bee9de13c`
- package: `@myeongha/face-reading@0.0.0`
- tarball SHA-256: `8d793c57e104fc0137a17dc631d208b468131b1d9a9668142a846e34dacbf84a`
- public export: `@myeongha/face-reading/preview-engine`
- FE023 contract: `FE023-DIGEST-BOUND-DIRECT-BLOB-PRODUCT-PREVIEW-SESSION-v1`
- MediaPipe dependency: `0.10.35`

The root package path and internal implementation paths remain unexported.

## Materialization

A branch-scoped seed workflow reconstructs the package from the exact public Saju source commit, runs the preview-package build, packs the private workspace package, and refuses to commit it unless the resulting SHA-256 exactly matches the already accepted FE024 handoff digest.

This seed operation is one-time. Normal builds consume the committed, digest-pinned tarball and do not rebuild Saju.

## Boundary

FE032 does not publish a registry package and does not widen the package export surface. It adds no image persistence, identity embedding, interpretation/classification/ranking, production authority, or commerce authority.
