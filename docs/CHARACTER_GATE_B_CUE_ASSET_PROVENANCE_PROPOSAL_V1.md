# Character Gate B Cue / Asset / Provenance Proposal V1

Status: **PROPOSAL — NON-AUTHORITY / NOT APPROVED FOR PRODUCTION**  
Proposal baseline `main`: `e164fb8f3c2fa5a8693574c9f419c3d23aa8e4c2`  
Scope: Character Runtime Gate B concrete publication authority for the launch Character set

> This document is a Product Owner decision proposal only. It is **not** a source-authority decision, does not approve a Production cue ID, does not approve or create a visual asset, does not establish asset provenance, and does not authorize Production publication. Merging this proposal must not be interpreted as Product Owner approval or launch authority.

## 1. Why this proposal exists

Repository authority currently separates two concerns:

1. the Character content publication/release mutation protocol is implemented, including `cmd_publish_character_content_bundle_v1(...)`, `cmd_create_content_release_v1(...)`, `cmd_activate_content_release_v1(...)`, and the related retirement commands; and
2. the concrete Character payload needed to invoke that protocol truthfully is still absent.

`docs/CHARACTER_GATE_B_PUBLICATION_BLOCKER_EVIDENCE.md` records the remaining blocker after the lifecycle mutation work: no approved complete Production emotion/animation cue assignment, no canonical Production visual assets/stable refs, no sufficient provenance/checksum manifest, and no concrete cue-to-asset mapping / resulting `assetManifestHash`.

`docs/source-authority-decisions/CHARACTER_RUNTIME_ASSET_AUTHORITY_REQUEST_V1.md` already defines the fail-closed Gate A contract. Gate B requires a separate, source-backed Product Owner decision for the concrete publication material. This proposal defines the decision surface that must be filled; it deliberately does not fabricate the missing material.

## 2. Launch Character scope already fixed by upstream authority

This proposal does not reopen Character identity, persona, Saju role, or immutable visual direction. It applies only to the approved launch Character IDs:

- `seyeon`
- `yeoul`
- `seorin`
- `rahyeon`
- `mira`
- `taegyeom`
- `yunho`
- `doyun`
- `baekheon`

The immutable authoring and runtime authoring already present in the repository remain upstream authority. Visual direction metadata is **not** equivalent to an approved visual asset file and must not be used to synthesize publication authority.

## 3. Current concrete Gate B inputs — intentionally unresolved

The following values are required for a truthful Production publication but are not supplied by this proposal:

| Required input | Proposal value | Production meaning |
| --- | --- | --- |
| stable `emotionIds` registry | **NOT PROVIDED** | no Production emotion ID is authorized here |
| stable `animationCueIds` registry | **NOT PROVIDED** | no Production animation cue ID is authorized here |
| `cueSchemaVersion` bound to an exact registry | **NOT PROVIDED** | version cannot be asserted before the exact registry exists |
| actual Character visual source files | **NOT PROVIDED** | no image/animation file is approved here |
| stable `assetRefs` | **NOT PROVIDED** | no URI/ref convention instance is approved here |
| source owner/licensor records | **NOT PROVIDED** | no provenance claim is made here |
| source-file checksums | **NOT PROVIDED** | no checksum is manufactured here |
| cue-to-asset mappings | **NOT PROVIDED** | no cue is mapped to an asset here |
| canonical asset manifest | **NOT PROVIDED** | no manifest can be truthfully built yet |
| `assetManifestHash` | **NOT PROVIDED** | no `sha256:v1:*` value may be fabricated |

`NOT PROVIDED` is a status marker only. It is not a schema value and must never be copied into a runtime payload.

## 4. Proposal B1 — stable cue registry authority contract

### 4.1 Registry source

A Gate B cue decision must pin an exact repository source at an immutable commit/blob/path. The pinned source must define, without ambiguity:

- every Production `emotionId` allowed for the launch Character set;
- every Production `animationCueId` allowed for the launch Character set;
- which Character may reference which IDs;
- the exact `cueSchemaVersion` for that registry;
- compatibility behavior across cue-schema versions;
- unknown/missing cue behavior; and
- still-image fallback behavior.

A prose statement such as “use normal emotions” or “use standard animations” is insufficient because it does not establish stable identifiers.

### 4.2 Stable-ID invariants

The approved registry should satisfy all of the following:

1. IDs are stable opaque product identifiers after publication; display labels may change without changing IDs.
2. An ID may not be silently reassigned to a different semantic meaning.
3. Removal or incompatible semantic change requires a new `cueSchemaVersion` and an explicit compatibility decision.
4. Character payloads may reference only IDs present in the exact approved registry version.
5. Unknown cue IDs fail closed; the renderer/runtime must not infer or synthesize a replacement ID.
6. A fallback may choose only an explicitly approved still asset/mapping. Fallback must not manufacture a cue.
7. Registry ordering is non-semantic unless separately specified.

### 4.3 Character assignment

The concrete authority source must contain a complete nine-Character assignment. For each Character it must provide:

```text
characterId
emotionIds[]
animationCueIds[]
```

No row may be inferred from another Character. “Same as X” is acceptable only if the authority source resolves it deterministically into the exact stable IDs used by both Characters.

### 4.4 Version compatibility

The concrete decision must state one of the following for each version transition:

- backward compatible: old published IDs retain their exact meaning and remain valid;
- additive compatible: only new IDs are added and old IDs retain exact meaning; or
- breaking: requires a new schema version and explicit client/runtime compatibility handling before activation.

Absent an explicit compatibility statement, the transition is treated as breaking and publication/activation must fail closed.

## 5. Proposal B2 — visual asset / provenance / manifest authority contract

### 5.1 Exact source files

For every asset intended for Production, the concrete Gate B authority must pin the exact source material. At minimum each asset record must identify:

- stable `characterId`;
- stable logical `assetRef`;
- exact source repository/blob/object identity;
- source owner or licensor;
- permitted product usage scope;
- immutable content checksum;
- media/type metadata required by the runtime; and
- the cue/still role that asset is allowed to fulfill.

A visual-direction description, generated preview, screenshot, local filename, or unpinned external URL is not sufficient source authority by itself.

### 5.2 Provenance minimum

The approved provenance record must be sufficient to answer, for every Production asset:

- what exact bytes are being published;
- who owns or licenses those bytes for this product scope;
- which approved Character they belong to;
- which stable asset reference resolves to those bytes; and
- which checksum proves that the published material is the approved material.

If ownership/licensing or exact-byte identity is unresolved, that asset remains non-publishable.

### 5.3 Cue-to-asset mapping

The concrete manifest must map every Production cue used by a Character to an approved asset behavior. The mapping must be explicit enough that the runtime does not need to guess by filename, label, ordering, or Character similarity.

At minimum the mapping authority must identify:

```text
characterId
cueSchemaVersion
emotionId or animationCueId
assetRef
fallbackAssetRef (only when explicitly approved)
```

A Character must not publish an ID that lacks an authoritative mapping unless the approved runtime contract explicitly defines that ID as non-visual and validates that case.

### 5.4 Manifest canonicalization and hash

The existing Gate A authority requires the asset manifest hash shape:

```text
sha256:v1:<64 lowercase hex>
```

The hash must be derived from the **actual approved manifest**, not selected manually to satisfy validation. The concrete authority package must use the repository-approved canonical serialization/hash procedure, including RFC 8785 JSON Canonicalization Scheme semantics where already specified by Gate A, UTF-8 bytes, and SHA-256.

The canonical manifest root must include the exact visual asset records, provenance/checksum material, and cue mappings required by the approved Gate A contract. Any change to material rooted by the manifest requires a newly derived hash; a copied historical hash is invalid evidence.

## 6. Required concrete authority package

Gate B can move from proposal to source-authority decision only when a reviewable package exists containing all of the following:

### B1 — cue package

- exact immutable source commit/blob/path;
- exact `cueSchemaVersion`;
- exact allowed emotion ID registry;
- exact allowed animation cue ID registry;
- complete nine-Character ID assignments;
- compatibility/fallback semantics;
- renderer/runtime validation compatibility evidence.

### B2 — asset package

- exact immutable source file/blob/object identities for every Production asset;
- owner/licensor and usage-scope evidence;
- complete nine-Character asset mapping;
- stable `assetRefs`;
- exact file/content checksums;
- complete cue-to-asset mapping;
- canonical manifest artifact;
- reproducible canonical `assetManifestHash` derivation evidence.

Partial presence is useful for review but is not sufficient to publish any Character under this launch decision. The launch publication remains fail-closed until the approved package is complete for the intended published set.

## 7. Product Owner decision requested

The Product Owner is asked to make **separate explicit decisions** rather than allowing repository inference.

### Decision B1 — cue registry contract

Choose one:

- **APPROVE B1 CONTRACT** — approve Sections 4 and the B1 completeness requirements as the contract that the concrete cue authority package must satisfy.
- **REVISE B1 CONTRACT** — specify the exact required changes.
- **REJECT B1 CONTRACT** — provide the replacement authority model.

Important: approving the B1 contract alone does **not** approve any cue ID because this proposal intentionally contains no concrete cue registry.

### Decision B2 — asset/provenance contract

Choose one:

- **APPROVE B2 CONTRACT** — approve Sections 5 and the B2 completeness requirements as the contract that the concrete asset authority package must satisfy.
- **REVISE B2 CONTRACT** — specify the exact required changes.
- **REJECT B2 CONTRACT** — provide the replacement authority model.

Important: approving the B2 contract alone does **not** approve any asset, ref, provenance claim, checksum, manifest, or hash because this proposal intentionally contains no concrete asset package.

### Concrete material approval

After the real B1/B2 material exists, a **separate source-authority decision** must pin its exact immutable source commit/blob/path and explicitly approve/reject that material for Production. That later decision is the first document allowed to serve as Gate B concrete publication authority.

## 8. What approval of this proposal does not do

Even if the Product Owner approves both proposal contracts:

- Production Character publication remains blocked until the concrete B1/B2 packages exist and are separately approved;
- no runtime catalog row may be populated from invented values;
- no bundle/release command may be invoked with fabricated cue/asset/provenance/hash material;
- no positive Member `POST /api/chat` Production E2E may be claimed before a real approved Character release is published and active;
- same-Character thread reuse and re-auth continuity Production E2E remain downstream of that publication precondition.

## 9. Separate boundaries preserved

### Content release lifecycle

The lifecycle mutation authority implemented by the `0980`/`0981` migration line is a separate concern and is not reopened by this proposal. It provides the command surface but does not manufacture Character payload authority.

### General Natal

General Natal Production methodology/rule/interpretation authority remains a separate boundary. Nothing in this Character Gate B proposal grants, changes, or implies General Natal Production authority.

## 10. Prohibited interpretations

This proposal must not be used to justify any of the following:

- inventing Production `emotionIds` or `animationCueIds` after merge;
- treating generic renderer labels as approved IDs without an exact authority source;
- generating an asset and treating generation itself as ownership/provenance approval;
- inventing `asset://`, CDN, storage, or other refs merely because they satisfy schema shape;
- inventing checksums or `sha256:v1:*` manifest hashes;
- manually patching Production tables around the content-operator command surface;
- treating CI green, proposal merge, or proposal approval as Production publication completion.

## 11. Closure sequence after concrete approval

Only after the later source-authority decision approves the exact B1/B2 material may implementation proceed:

1. materialize the approved stable cue registry and nine-Character assignments;
2. materialize/pin the approved assets, stable refs, provenance, and checksums;
3. build the canonical cue-to-asset manifest and reproducibly derive `assetManifestHash`;
4. construct the exact Production Character payload and run authoring/production validators;
5. run exact-head CI and asset/manifest integrity checks;
6. squash merge the implementation;
7. revalidate merged main;
8. use the authorized content-operator lifecycle commands to publish the immutable bundle and activate the intended release;
9. read back the active release/runtime catalog from the authoritative query surface;
10. execute legitimate Member `POST /api/chat` positive smoke;
11. prove same-Character thread reuse;
12. prove re-auth/session continuity and ownership/privacy boundaries;
13. record exact Production release/bundle pinning and E2E evidence.

Until those conditions are satisfied, Gate B remains **BLOCKED — concrete payload authority absent**.
