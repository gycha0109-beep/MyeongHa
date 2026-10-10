# M3-β-2b: Reader T1 / private generation / T2 held rehearsal

Status: **internal deny-only rehearsal, not approved operational finalization**.

Implementation: `apps/api/src/official-reader-held-t1-t2-preflight-v1.ts`.
Regression: `test/official-reader-held-t1-t2-preflight-v1.test.ts`.

## Transaction ordering

1. T1: `executePostgresSubjectTransactionV1` resolves canonical Subject, reads a fresh PostgreSQL `clock_timestamp()`, requests the existing A2 server admission under the Subject transaction, and commits/releases its DB connection.
2. Outside any held T1 connection: invoke the private generator. Its return value is discarded; it cannot enter this seam's return value.
3. T2: a **new** canonical-Subject transaction and fresh DB clock re-run the existing A2 admission. Compare exact Subject, Thread revision, Reading, Reader, content bundle/release, Product/spec/policy revision, Saju domain, contract, and immutable Official artifact hash to T1. Consume both one-use admission tickets.
4. Irrespective of both transactions succeeding: return only `{status:'held', publicDisclosureAuthorized:false}`. Failures throw one sanitized error without exposing the generated text.

The T1 `effectiveAt` is **not** reused as a T2 authority clock. It is deliberately excluded from cross-phase equality because each phase must use its own DB clock; within each phase the admission scope must equal that phase's DB clock. Neither generator nor any browser/request supplies subject identity or Official Reading source.

## Evidence and remaining blockers

This is a **unit-testable application composition contract only**. The injected A2 admission can revalidate *currently visible* exact-reader access, Product and source identity, but migration 1270 still supplies a STABLE query and there is **no R2 scope lock shared with Commerce writers**. Therefore a positive A2 recheck, even while in a transaction, is **not permission to send bytes**: the DB-C4 new-Grant/access phantom proven in PR #1864 and Commerce revoke timing in PR #1877 remain unresolved at the final disclosure boundary.

Not implemented or claimed here: DB Owner-approved R2-BP vs R2-NEW, lock ordering, isolated REPEATABLE READ/READ COMMITTED policy, timeout/deadlock recovery, commit-versus-network-send linearization, real PortOne refund webhook E2E, paid artifact persistence, live public endpoint, Product Capability policy #1828, or actual Saju/LLM E2E.

DO NOT wire this seam to a public transport, return generated output, modify SQL/Commerce authority, approve saleability, or consider these unit tests an operational T2 pass. Owner decisions remain tracked in #1827 and #1828; mobile design Draft #1823 remains HOLD.
