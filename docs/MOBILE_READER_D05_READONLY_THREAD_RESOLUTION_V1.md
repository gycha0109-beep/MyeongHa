# D-05 — Official Reading × Reader × Existing Thread read-only resolver v1

> Status: **INTERNAL COMPOSITION ONLY / OWNER DECISION HOLD / PUBLIC OFF**
>
> Watchtower-Track: frontend-integration
>
> Depends on: #1823, #1827, #1828 and the existing A2 server admission boundary.

## Implemented in this slice

`apps/api/src/official-reading-reader-thread-resolution-v1.ts` composes:

1. Server-resolved canonical **Member** identity (Guest cannot be implicitly upgraded).
2. `resolveCharacterStandardReadingAccessMetadataV1` over the established exact purchase-backed Reader access read authority (`qry_character_standard_reading_access_runtime_v2`).
3. Product-owned approved Reader policy via `resolveProductReaderEligibilityV1`.
4. An **injected, server-only, read-only** `readActiveMemberSingleCharacterThreads(subjectId, readerCharacterId)` locator authority port.
5. Existing known-thread `getChatThreadRuntimeBinding` verification for owned active Thread, single Reader and pinned content bundle.
6. Rechecks current Reader access, Product policy revision and Thread runtime binding within the lookup. A single pinned evaluation time does **not** provide cross-transaction revoke or T2 reveal linearization.

The function returns identity/scope metadata only. It does not return an A2 admission ticket, raw Official Reading artifact, generated Reader output, payment/Grant data, or any public route.

No production DB implementation exists for the injected locator port: **D-05 discovery is not yet live**. A production locator must be separately authorized by the DB/API owners, be read-only and subject-scoped, and reject 0/2+ candidates. Client-provided `threadId`, Records attribution and ordinary `POST /api/chat` must not be substituted for this port.

## Authority and failure behavior

| Case | Internal result |
| --- | --- |
| Member, exactly one existing owned single-Reader Thread, exact current access, approved Product, matching bundle | Frozen scoped lookup result |
| Guest or missing/unresolved identity | ACCESS_DENIED, no DB read |
| Missing/revoked/other Reader/other Reading access | ACCESS_DENIED, no policy or Thread discovery |
| Withheld/missing/excluded Product policy | POLICY_HOLD, no Thread discovery |
| No candidate / locator unavailable | THREAD_UNAVAILABLE; no creation |
| Duplicate or two or more candidates | THREAD_AMBIGUOUS; no first/latest selection |
| Different Thread Reader/bundle/multi-participant | THREAD_INCOMPATIBLE |
| Access/source/policy/Thread drift in repeated read | Fail closed |

Same Reader may have multiple Official Readings; a single Member×Character Thread is a **proposed reuse candidate**, not an approved new DB identity rule. Exact Reading×Reader access is always independent of generic Chat ownership.

## Not implemented / owner approval required

- **D05-A**: Owner-approved shared Member×Reader Thread vs dedicated Reading×Reader Thread policy.
- **D05-B**: Real read-only SQL runtime locator (minimal least-privilege RLS, canonical Subject scope, exact bundle handling) and actual PostgreSQL integration tests.
- **D05-C**: Thread creation path and default Content Release vs grant-pinned Bundle conflict resolution.
- **D05-D**: Guest/member promotion and re-entry, public DTO, mobile navigation, Reader paid interpretation persistence and Chat V2.
- **D02/#1827**: Final T2 reveal shared writer lock and refund/revoke linearization.
- **#1828**: Product/Reader eligibility and Character capability mapping across approved bundles.

**Do not enable:** Product Offer or checkout, Reader public route, admission/reveal, grant creation, Production Saju execution, Chat send, or Reader commercialization.

## Test scope

`test/official-reading-reader-thread-resolution-v1.test.ts` includes synthetic authority-port tests for canonical Member boundary, early denial, exact access and Product policy, locator 0/2+ handling, no creation, participant/bundle mismatch, revoked access and drift, and repeated read-only invocation.

These tests establish internal orchestration only, not DB authority/RLS/lock correctness or integrated paid Reader E2E.

## Follow-on slice after owner decision

Create a DB-owned read-only Thread discovery function/adapter with real isolated PostgreSQL tests, then wire it **only** to a separately approved server internal entrypoint. Re-run exact-grant checks at admission and at the authorized T2 final send boundary.
