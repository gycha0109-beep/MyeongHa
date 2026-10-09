# MyeongHa Security — Council identity, future Memory Projector and Reader revocation checks

Watchtower-Track: security
Scope: security regression and one minimal Council transcript-admission check.
No paid model inference or Production Provider/model-routing change.

## 1. Council peer-to-peer impersonation

`guardCharacterSajuCouncilConsistencyV1` previously checked `turn.utterance.characterId === turn.characterId`, but not whether the turn was spoken by its *server-selected participant* in `transcript.participantCharacterIds[turnIndex]`. An attacker who forged **both** visible fields could evade that particular identity consistency check, even though semantic text and other guards remained separate.

This patch adds a deterministic check against the turn-indexed participant list to the existing `TURN_IDENTITY_MISMATCH` failure. The test falsifies both outer and nested actor identities, pins an unmodified participant list, and expects the guard to reject it. It adds no inference call and does not alter Council grounding, event semantics, ordering, or output shape.

**Limit:** This does not cryptographically authenticate a wholesale forged transcript whose participant list is also rewritten. Authoritative Council admission still needs server-pinned input provenance and the existing Output Guard. This test is NOT an LLM agent-injection pass.

## 2. Future Memory Projector payload poisoning

`SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1` is **still empty in Production**. A synthetic server-supplied future projector admits a malicious summary including a fake role, Subject and grant ID. The context result keeps server-provided `recordId` and `grantId`; payload-embedded claims do not change authority identity. Duplicate type/version registration and nonfinite/invalid scoring remain rejected; fake developer messages in user chat retain user role.

**Residual limitation:** The malicious `summary` is still returned as *memory content* when a hypothetical authorized projector passes it through. The tests do not prove that the downstream model will ignore it, and do not permit enabling new production projectors without source/schema approval and live-model adversarial validation.

## 3. Reader grant/Memory revocation fresh-read

The already-CI-integrated `test/db/reader_memory_tenant_boundary_v1.sql` extends its actual PostgreSQL run:
- With `myeongha_api_executor`, owner/Reader A access initially succeeds.
- The test fixture authority revokes Reader A's grant; a new invoker query returns **zero grants** without deleting the owner's Memory.
- The test fixture authority revokes the Memory; a new invoker owner query returns **zero memories** and grant lookup fails with `qry_memory_active_grants_memory_unavailable`.
- All changes stay in a rolled-back synthetic DB transaction.

**Residual limitation:** Revocation enforcement on a *new query* is not retroactive invalidation of content already copied into an in-flight model request, nor a cross-session concurrency proof. A separate design is required for commit/reveal rechecks if Product defines a stricter revocation timing SLA.

## Rollout / safety

- No AI calls, no change to the V1 619-character boundary, no V2 model activation.
- No new GitHub Actions workflows or database migrations.
- Test under existing security CI, runtime DB suite, full Integration.
- Retain cost-incident `if: ${{ false }}` on paid-model workflow(s).
- **A**: Added deterministic tests and CI PASS.
- **B / HOLD**: Live model attacks, post-context revocation invalidation across sessions, and authoritative transcript identity independent of transcript fields.
- **C / FAIL**: Loss of legitimate Council transcript acceptance, unauthorized Reader access, or change to live inference cost/call counts.
