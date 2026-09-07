# Character Gate B Production Publication Blocker Evidence

Status: **BLOCKED — evidence only**  
Baseline `main`: `ecf75eef9dd8bc4dff44ff462d3d4e73c17e1727`  
Scope: Character Runtime / Gate B Production publication / Member Chat positive E2E

This document records repository-authoritative blockers observed at the baseline above. It creates **no new source-of-truth authority**, approves no Character payload, assigns no stable IDs, creates no asset provenance, and authorizes no Production mutation.

## 1. Blocker A — concrete Gate B payload authority is absent

The current Production Character contract requires concrete publication material, including:

- approved Production `emotionIds`
- approved `animationCueIds`
- actual visual `assetRefs`
- asset manifest entries and asset provenance
- canonical SHA-256 `assetManifestHash`
- concrete cue-to-asset mappings
- the applicable `cueSchemaVersion`

Repository inspection shows that the current Character content Production/release code validates and assembles **supplied** publication material. It does not itself establish authority to invent missing emotion/animation IDs, create visual assets, manufacture provenance, choose canonical asset references, or derive a manifest hash from non-authoritative material.

The existing Gate B authority/evidence, including the boundary recorded around PR #567, does not authorize or generate those concrete visual-asset and cue assignments. Therefore schema-valid placeholders or fabricated values are not publication authority.

## 2. Blocker B — release lifecycle mutation authority remains open (`SRC-27`)

Independently of the concrete payload blocker, the repository does not yet establish the complete authoritative Production mutation protocol required to execute the release lifecycle.

The unresolved lifecycle surface includes:

- bundle register/publish
- release create
- release activate / default transition
- release retire
- mutation idempotency semantics
- operator authorization semantics
- default-swap / active-release transition semantics

`SRC-27` records this lifecycle-mutation authority as an open P0 boundary. Supplying valid Character payload material alone would therefore not authorize an ad-hoc Production DB mutation.

## 3. Negative repository evidence at the baseline

Fresh repository inspection at the baseline above found:

- no authoritative `cmd_publish_*` implementation for this Character release path
- no authoritative `cmd_activate_*` implementation for this Character release path
- no migration after `0970_member_character_thread_open_runtime_authority.sql` establishing the missing Character publication/activation mutation authority
- no canonical Production visual-asset bundle, manifest/provenance set, and cue-to-asset mapping sufficient to publish the nine launch Characters

Negative search evidence is not itself a new authority; it is recorded only to make the current blocker reproducible and to prevent an unsupported publication shortcut.

## 4. Prohibited shortcuts

Until both blocker classes are closed by repository authority, the following must **not** be used to claim Gate B publication completion:

- fabricate or locally choose Production stable emotion/animation IDs
- fabricate asset URIs or `assetRefs`
- fabricate a `sha256:v1:*`-shaped `assetManifestHash`
- treat schema/validator acceptance as publication authority
- directly patch Production tables to simulate bundle/release activation
- claim positive Member Chat Production E2E before an authoritative Character release is actually published and active

## 5. Unblock criteria

Gate B Production publication can proceed only after repository authority supplies all of the following:

1. approved concrete launch Character payloads, including stable emotion/animation cue IDs
2. actual visual assets with canonical stable references
3. canonical asset manifest entries, provenance/checksums, and cue-to-asset mappings
4. authoritative canonical manifest-hash derivation
5. release lifecycle mutation commands/protocol covering register/publish, create, activate/default transition, and retire
6. explicit authorization, idempotency, and default-transition semantics for those mutations

After those authorities exist, the execution sequence is:

1. build and validate the exact Production payload
2. execute the authoritative publication/release mutation path
3. verify the active Production Character release from the authoritative read surface
4. execute Member `POST /api/chat` positive smoke
5. verify same-Character thread reuse
6. verify re-auth continuity
7. record exact-head and Production E2E evidence

Until then, the correct repository-authoritative Gate B state is **BLOCKED**, not partially published and not simulated.
