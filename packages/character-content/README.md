# @myeongha/character-content

Immutable, versioned character content authority for Myeongha.

Rules:
- character canon originates from versioned content bundles, never runtime DB edits;
- capabilities are bounded and versioned;
- bundle members must share the bundle content version;
- deterministic manifests provide stable content hashes;
- `developmentPlaceholder` characters are explicitly non-canonical and exist only to validate product structure before real character authoring.
