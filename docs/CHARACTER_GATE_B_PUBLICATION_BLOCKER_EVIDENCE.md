# Character Gate B Production Publication Blocker Evidence

Status: **BLOCKED — concrete payload authority only; `SRC-27` mutation authority implemented**  
Authority parent `main`: `ef9854dc030ceb06eaad522e1100bd42223c94b0`  
Scope: Character Runtime / Gate B Production publication / Member Chat positive E2E

This document records the repository-authoritative Gate B boundary. The current change establishes the missing Character content publication/release mutation protocol, but it creates **no Character payload authority**, approves no visual asset, assigns no Production cue ID, and manufactures no provenance/hash material.

## 1. Blocker A — concrete Gate B payload authority remains absent

The current Production Character contract requires concrete publication material, including:

- approved Production `emotionIds`
- approved `animationCueIds`
- actual visual `assetRefs`
- asset manifest entries and asset provenance
- canonical SHA-256 `assetManifestHash`
- concrete cue-to-asset mappings
- the applicable `cueSchemaVersion`

Repository inspection shows that the Character content Production/release code validates and assembles **supplied** publication material. It does not itself establish authority to invent missing emotion/animation IDs, create visual assets, manufacture provenance, choose canonical asset references, or derive a manifest hash from non-authoritative material.

The existing Gate B authority/evidence, including the boundary recorded around PR #567, does not authorize or generate those concrete visual-asset and cue assignments. Therefore schema-valid placeholders or fabricated values are not publication authority.

## 2. Blocker B — release lifecycle mutation authority (`SRC-27`) is implemented

`supabase/migrations/0980_content_release_lifecycle_authority.sql` establishes the repository-side Character publication/release mutation protocol that was previously absent.

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

Published bundle metadata and the Character runtime projections are guarded against post-publication update/delete. Activated release binding and rollout identity are also immutable.

### Authorization boundary

The commands are executable only through the dedicated `myeongha_content_operator` NOLOGIN capability role. The ordinary `myeongha_runtime` / `myeongha_api_executor` path, `service_role`, `anon`, `authenticated`, and `PUBLIC` do not receive this capability and the operator role receives no direct table-write privilege.

Concrete operator/login membership is deployment authority and is intentionally not fabricated in the repository migration.

### Deliberate non-authorities

This database command layer does **not** claim to:

- fetch artifact bytes and independently recompute `content_hash`
- invent or approve visual assets, cue IDs, provenance, or manifest entries
- interpret rollout cohorts
- resolve client-capability compatibility

Artifact-byte verification and authoring validation must happen before the publish command is invoked. Existing runtime compatibility authorities continue to fail closed where semantic compatibility authority is unavailable.

`test/db/content_release_lifecycle_authority.sh` plus `.github/workflows/db-content-release-lifecycle.yml` provide the dedicated PostgreSQL 17.6 authority gate, including ACL isolation, idempotency conflicts, immutability, default-swap semantics, retirement sequencing, and concurrent default-transition coverage.

## 3. Remaining negative repository evidence

After the `SRC-27` mutation authority is present, the remaining Gate B negative evidence is the absence of a canonical Production visual publication payload:

- no approved complete Production emotion/animation cue assignment for the launch Character set
- no canonical Production visual assets/stable asset references
- no authoritative asset provenance/checksum manifest sufficient for publication
- no canonical cue-to-asset mapping and resulting `assetManifestHash` sufficient to invoke the publication command truthfully

Negative search evidence is not itself a new authority; it is recorded only to prevent an unsupported publication shortcut.

## 4. Prohibited shortcuts

The following must **not** be used to claim Gate B publication completion:

- fabricate or locally choose Production stable emotion/animation IDs
- fabricate asset URIs or `assetRefs`
- fabricate a `sha256:v1:*`-shaped `assetManifestHash`
- treat schema/validator acceptance as concrete publication authority
- bypass the `myeongha_content_operator` command surface with direct Production table patches
- claim positive Member Chat Production E2E before an authoritative Character release is actually published and active

## 5. Remaining unblock criteria

The lifecycle mutation protocol is no longer a repository-authority blocker after this change lands. Gate B Production publication still requires authoritative concrete material for:

1. approved launch Character payloads, including stable emotion/animation cue IDs
2. actual visual assets with canonical stable references
3. canonical asset manifest entries, provenance/checksums, and cue-to-asset mappings
4. authoritative canonical manifest-hash derivation from those assets

Once those concrete authorities exist, the execution sequence is:

1. build and validate the exact Production payload and artifact hashes
2. publish the immutable Character bundle through `cmd_publish_character_content_bundle_v1(...)`
3. create and activate the Production release through the lifecycle commands
4. verify the active Production Character release from the authoritative read surface
5. execute Member `POST /api/chat` positive smoke
6. verify same-Character thread reuse
7. verify re-auth continuity
8. record exact-head and Production E2E evidence

Until the concrete material authority exists, the correct Gate B state remains **BLOCKED**, but no longer because of `SRC-27`.
