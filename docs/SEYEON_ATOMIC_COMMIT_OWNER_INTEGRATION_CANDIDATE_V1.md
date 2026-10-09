# Issue #1843 — Atomic Se-yeon Commit contract candidate v1

Watchtower-Track: security
Status: **CANDIDATE ONLY — not connected to Production**
Dependencies: #1843 (character-memory/DB), #1827 (Reader exact purchase-backed Grant), #1816 (paid model hold).
Previous evidence: PR #1841 (read-only shadow recheck), PR #1845 (real PostgreSQL two-session lock probe).

## 1. Existing commit isolation is usable

The existing `createSeyeonProductionTransactionalPortsV1` runs `commitTurn` using `runner.run(subjectId, callback)`. That callback issues the currently installed `cmd_commit_seyeon_chat_turn_runtime_v2` within **one canonical Subject database transaction**. Existing Context Assembly, generated/validated persistence, replay receipt, and non-Memory knowledge reads are independent transactions. A separate pre-Commit SELECT cannot satisfy revocation atomicity.

The Production `SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1` registry is **empty**; no public Se-yeon Chat route is mounted. This is a forward-activation gate, not a proven live disclosure incident.

## 2. New candidate implementation

`apps/api/src/seyeon-atomic-personal-record-commit-candidate-v1.ts` is an **unwired** owner-integration contract. It accepts a hypothetical trusted, immutable per-attempt vector:

`(kind, recordId, grantId, recordType, schemaVersion, admittedRecordDigest)`

and a canonical Subject, Thread, and Attempt ID. It requires the **same transaction client** for:
1. `lockCurrentRecordsInSameTransaction`: DB-owner implementation must check current active exact Grant and nonrevoked Memory/Life Fact, pin scope, schema/type and raw record digest, and retain row locks through Commit.
2. `commitTurnInSameTransaction`: owner adapter must call the authoritative Chat commit using that SAME client before releasing locks.

The candidate rejects malformed/duplicate evidence, missing pins, revoked original grants, replacement grant IDs for the same Memory, changed raw content digest, and DB failures. It never exposes an HTTP Reveal mechanism and always reports `permitsProductionReveal:false`.

**Security qualification:** callback shape alone cannot prove that the owner implementation really acquired PostgreSQL locks, derived data from an immutable server store, or preserved the commit transaction. The proven lock behavior is limited to the independent two-session test fixture in PR #1845. This code is NOT an authorization token; an untrusted caller could fabricate the vector and digest if placed on a public boundary. The production DB owner must add a tamper-resistant provenance storage policy first.

## 3. Owner review and implementation work

- **Character-memory owner:** bind Context Assembler's exact admitted records (including zero-record explicit shape) to turn and attempt; persist provenance server-side with immutable schema/digest and non-client-write permissions. Never read records directly from model output or caller request. Review other sensitive Context sources.
- **DB owner:** add a reviewed forward-only migration with a least-privilege atomic lock/check/Commit function; verify exact Grant and Memory/Life Fact rows plus Subject/Thread/Attempt under correct executor/owner roles. Lock all revocable rows in deterministic order. Use bounded `lock_timeout`, no phantom lock/probe left installed, and test rollback with two real concurrent sessions.
- **Reader/Commerce owner:** independently decide the policy for Reader reading entitlement, refund/revoke and replay (#1827). Do not substitute Se-yeon Memory grants for purchase-backed Reader authority.
- **HTTP/runtime owner:** gate `committed_replay` and Controlled Reveal using committed server provenance. No assistant text should leave the server when a used source is now revoked. A static one-time pre-HTTP check cannot retract previously streamed bytes. Define the visibility linearization point explicitly; avoid extra paid inference.

## 4. Regression cases

`test/seyeon-atomic-personal-record-commit-candidate-v1.test.ts` covers:
- same mock transaction client for check and commit and correct ordering;
- no commit on revoked original grant / reissued different grant / changed raw digest;
- duplicate DB rows, malformed provenance and DB lookup failure fail closed;
- zero-record proof not automatically promoted;
- cross-Subject binding mismatch denies commit.

Production Owner integration and **real** two-session race against `cmd_commit_seyeon_chat_turn_runtime_v2` are deliberately not asserted PASS by these unit tests.

## 5. Exit

A: security-owned candidate logic, tests, Integration and main CI PASS.
B: Production provenance + actual SQL atomic Commit + controlled reveal/replay + owner signoff **HOLD**.
C: no real AI calls, no security V1/V2 policy promotion, no new CI workflows, no previous migration edits, no new executor table DML grants, no public endpoints.
