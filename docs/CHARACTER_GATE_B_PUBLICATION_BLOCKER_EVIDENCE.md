# Character Gate B Production Publication Blocker Evidence

Status: **BLOCKED — exact-nine canon completion + concrete visual/cue/provenance payload; `SRC-27` mutation authority implemented**  
Authority parent `main`: `d80ede71f7cc5e297702a86c8c6ab585e63f9476`  
Scope: Character Runtime / Gate B Production publication / Member Chat positive E2E

This document records the repository-authoritative Gate B boundary. Release/publication mutation authority and diagnostic tooling now exist, but the repository still does **not** contain a complete source-authorized Production payload for all nine Launch Characters.

No schema-valid placeholder, fabricated renderer key, invented asset reference, synthetic hash, or unapproved psychology translation may be used to bridge the remaining gap.

## 1. Blocker A — exact-nine complete Character payload authority is still incomplete

### 1.1 Canon psychology completion is pending Product Owner decision

`CharacterCanonProfile.psychology` requires:

- `desire`
- `fear`
- `flaw`
- `contradiction`
- `hiddenMotivation`

The approved Character Detailed Authoring Proposal v1 already authorizes the semantic baseline that includes real flaw, hidden motivation, Human/Agency theory and related Character theses. However, the exact `desire / fear / contradiction` field values were not directly approved under those schema field names.

PR **#585** therefore proposes an exact-nine translation of those three remaining fields and explicitly remains a Product Owner decision gate. Green CI on #585 is not approval and must not be treated as canon authority.

Until that decision is recorded in a separate source-authority decision and translated into typed exact-nine canon completion, the complete Production Character payload cannot be assembled truthfully.

### 1.2 Concrete visual/cue/provenance material remains absent

The current Production Character contract also requires concrete publication material, including:

- approved Production `emotionIds`
- approved `animationCueIds`
- actual visual `assetRefs`
- asset manifest entries and asset provenance
- canonical SHA-256 `assetManifestHash`
- concrete cue-to-asset mappings
- the applicable `cueSchemaVersion`

Repository Production/release code validates and assembles **supplied** publication material. It does not establish authority to invent missing emotion/animation IDs, create visual assets, manufacture provenance, choose canonical asset references, or derive a manifest hash from non-authoritative material.

The existing Gate B authority/evidence, including the boundary recorded around PR #567, does not authorize or generate those concrete visual-asset and cue assignments. Therefore schema-valid placeholders or fabricated values are not publication authority.

## 2. Blocker B — release lifecycle mutation authority (`SRC-27`) is implemented

`supabase/migrations/0980_content_release_lifecycle_authority.sql` establishes the Character publication/release mutation protocol that was previously absent.

The mutation surface is:

- `cmd_publish_character_content_bundle_v1(...)`
  - atomically records the already-built bundle metadata plus Character runtime catalog/capability/relation projections
  - requires canonical `sha256:v1:<64 lowercase hex>` content and asset-manifest hash values
  - exact retries converge on the already-published bundle
  - changed retries for the same bundle identity fail closed
- `cmd_create_content_release_v1(...)`
  - creates a draft release only
  - exact retries converge; conflicting reuse of release identity/key fails closed
  - refuses missing or retired bundles
- `cmd_activate_content_release_v1(...)`
  - serializes lifecycle transitions transactionally
  - refuses retired releases/bundles
  - requires an active default before a non-default release can first activate
  - an explicit default transition atomically demotes the previous default to active/non-default and activates/promotes the target
  - never mutates pinned conversation threads
- `cmd_retire_content_release_v1(...)`
  - is idempotent
  - refuses retirement of the current active default until a replacement default has been activated
- `cmd_retire_content_bundle_v1(...)`
  - is idempotent
  - refuses retirement while any active release still references the bundle

Published bundle metadata and Character runtime projections are guarded against post-publication update/delete. Activated release binding and rollout identity are also immutable.

### Authorization boundary

The commands are executable only through the dedicated `myeongha_content_operator` NOLOGIN capability role. The ordinary `myeongha_runtime` / `myeongha_api_executor` path, `service_role`, `anon`, `authenticated`, and `PUBLIC` do not receive this capability and the operator role receives no direct table-write privilege.

Concrete operator/login membership is deployment authority and is intentionally not fabricated in the repository migration.

## 3. Readiness infrastructure already implemented

The remaining blockers are now diagnosable without weakening authority boundaries.

### 3.1 Candidate assembler

`packages/character-content/src/content-candidate-assembler-v1.ts` joins:

- approved immutable Character authoring
- approved runtime Character authoring
- explicit caller-supplied canon completion
- explicit caller-supplied publication material
- explicit bundle metadata

It refuses roster mismatch and never derives missing canon, renderer IDs, assets or bundle metadata.

### 3.2 Publication readiness preflight

Merged PR **#586** adds `inspectCharacterPublicationReadinessV1(...)`.

The preflight reports, without defaulting or fabrication:

- missing bundle metadata
- missing/blank exact-nine worldview and psychology fields
- missing/blank per-Character `assetRefs`
- missing/blank per-Character `emotionIds`
- missing/blank per-Character `animationCueIds`
- duplicate or unexpected Character IDs

`ready=true` means only that supplied inputs are structurally complete enough to proceed to the existing assembler/validator. It is **not** a source-authority decision and is **not** Production publication authority.

### 3.3 Production Member Chat smoke harness

Merged PR **#584** provides a manual-only Production Member `POST /api/chat` open/reuse/re-auth smoke for the approved exact-nine Character IDs.

It performs no content seeding and cannot make a missing Character release exist. It is intentionally useful only after an authoritative Character bundle and active release are actually present in Production.

## 4. Remaining negative repository evidence

The remaining Gate B negative evidence is now two-part:

1. no approved exact-nine `desire / fear / contradiction` completion yet; PR #585 remains pending Product Owner decision
2. no canonical complete Production visual/cue/provenance payload sufficient to publish the launch Character set

The second part includes:

- no approved complete Production emotion/animation cue assignment for the Launch Character set
- no canonical Production visual assets/stable asset references
- no authoritative asset provenance/checksum manifest sufficient for publication
- no canonical cue-to-asset mapping and resulting `assetManifestHash` sufficient to invoke the publication command truthfully

Negative search evidence is not itself a new authority; it is recorded only to prevent an unsupported publication shortcut.

## 5. Prohibited shortcuts

The following must **not** be used to claim Gate B publication completion:

- merge or consume PR #585 as canon without explicit Product Owner approval
- infer `desire / fear / contradiction` from adjacent fields without the recorded decision
- fabricate or locally choose Production stable emotion/animation IDs
- fabricate asset URIs or `assetRefs`
- fabricate a `sha256:v1:*`-shaped `assetManifestHash`
- treat readiness-preflight success, schema validation, or CI green as concrete publication authority
- bypass the `myeongha_content_operator` command surface with direct Production table patches
- claim positive Member Chat Production E2E before an authoritative Character release is actually published and active

## 6. Remaining unblock criteria

The lifecycle mutation protocol, candidate assembler, readiness preflight and manual Member Chat smoke are no longer repository-tooling blockers.

Gate B Production publication still requires:

1. Product Owner decision for the exact-nine psychology completion proposed in PR #585
2. typed source-authorized exact-nine canon completion
3. approved stable emotion/animation cue IDs
4. actual visual assets with canonical stable references
5. canonical asset manifest entries, provenance/checksums and cue-to-asset mappings
6. authoritative canonical manifest-hash derivation from those assets

Once those concrete authorities exist, the execution sequence is:

1. run publication readiness preflight against the exact supplied package
2. assemble and validate the exact Production Character bundle candidate
3. verify artifact bytes, provenance and canonical hashes
4. publish the immutable Character bundle through `cmd_publish_character_content_bundle_v1(...)`
5. create and activate the Production release through the lifecycle commands
6. verify the active Production Character release from the authoritative read surface
7. execute the manual Member `POST /api/chat` positive smoke
8. verify same-Character thread reuse
9. verify re-auth continuity
10. record exact-head and Production E2E evidence

Until the canon decision and concrete material authority exist, the correct Gate B state remains **BLOCKED**, but the remaining gap is now explicit and mechanically inspectable.
