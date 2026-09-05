# @myeongha/character-content

Immutable, versioned character content authority for Myeongha.

Rules:
- character canon originates from versioned content bundles, never runtime DB edits;
- capabilities are bounded and versioned;
- bundle members must share the bundle content version;
- deterministic manifests provide stable content hashes;
- `developmentPlaceholder` characters are explicitly non-canonical and exist only to validate product structure before real character authoring.

## Production publication boundary

Production character artifacts must pass `validateProductionCharacterContentBundle` (or be built through `buildProductionCharacterContentManifest`).

The boundary:
- reuses the full generic authored-character validation;
- requires at least 5 characters for the launch roster;
- rejects every `developmentPlaceholder`;
- requires source-authored nonblank gender canon for every Production roster member;
- requires versioned visual canon covering direction, silhouette, palette, motifs, costume direction, and prohibited tropes for every Production roster member;
- keeps gender and visual values free-form so this package does not invent the still-open real roster canon or a taxonomy that source has not defined;
- never infers canonical `characterId` from web/UI presentation keys or runtime database rows.

This package currently provides validation and deterministic immutable manifest construction only. Runtime database publication and release activation remain separate governed operations and must consume source-backed authored content.
