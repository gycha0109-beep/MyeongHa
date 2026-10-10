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

**D-05 DB read-only locator candidate now exists** in migration `1660_member_reader_existing_thread_locator_v1.sql` and the transaction-scoped adapter `postgres-official-reader-thread-locator-v1.ts`. The SQL is SECURITY INVOKER, API-executor-only, verifies bound canonical Member and returns 0/1/at most 2 matching active single-Character Threads. A return of 2 is an ambiguity signal for the server resolver. This remains a **dormant internal capability**: it is not wired into any public/API Reader route, never grants paid access, and requires DB/API Owner review before live activation. Client-provided `threadId`, Records attribution and ordinary `POST /api/chat` must not be substituted for this port.

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
- **D05-B**: SQL locator and adapter implemented as a reviewable read-only candidate, with isolated PostgreSQL integration tests; **DB/API Owner approval, actual production entrypoint wiring and Reader Grant/Bundle full E2E still pending**. SQL intentionally does not choose a Bundle: the existing Thread binding and Grant checks must agree at the server composition boundary.
- **D05-C**: Thread creation path and default Content Release vs grant-pinned Bundle conflict resolution.
- **D05-D**: Guest/member promotion and re-entry, public DTO, mobile navigation, Reader paid interpretation persistence and Chat V2.
- **D02/#1827**: Final T2 reveal shared writer lock and refund/revoke linearization.
- **#1828**: Product/Reader eligibility and Character capability mapping across approved bundles.

**Do not enable:** Product Offer or checkout, Reader public route, admission/reveal, grant creation, Production Saju execution, Chat send, or Reader commercialization.

## Test scope

`test/official-reading-reader-thread-resolution-v1.test.ts` includes synthetic authority-port tests for canonical Member boundary, early denial, exact access and Product policy, locator 0/2+ handling, no creation, participant/bundle mismatch, revoked access and drift, and repeated read-only invocation.

Server orchestration tests establish only internal composition. In addition, `test/postgres-official-reader-thread-locator-v1.test.ts` verifies the SQL adapter's bounded DTO; `test/db/official_reader_thread_locator_query.sh` executes an actual isolated PostgreSQL migration/role/RLS fixture and checks existing/empty/duplicate/cross-Subject/Guest cases. These tests **do not** prove integrated paid Reader E2E, revocation linearization or final public disclosure.

## Follow-on slice after owner decision

After DB/API Owner acceptance of the existing read-only locator and D05-A shared-Thread choice, wire the adapter **only** to an approved server internal entrypoint inside `executePostgresSubjectTransactionV1`. Then address D05-C first-Thread creation and bundle mismatch separately. Re-run exact-grant checks at admission and at the authorized T2 final send boundary.

## Web/mobile no-history Chat parity (non-Reader activation)

Owner direction: follow the existing web Character Room **empty history** behavior.
The web runtime invokes `ensureRoomReady()` on entering `chat.html?character=...`; the ordinary server-owned Member×Character Chat open command creates or reuses the Thread before the room history is read. **Only when that authoritative read returns zero messages** does the web room show its ephemeral introduction. The greeting is UI content, not a persisted Character turn.

Mobile general Chat follows the same lifecycle: tapping a Character calls existing Member-only Chat open/reuse, navigates to the returned server Thread, reads the authoritative history, then renders the matching canonical introduction only for verified empty history; the existing composer enables actual send for Se-yeon only. No default introduction on read failures, loading states or histories with messages.

This is **not** authorization to call the ordinary Chat open route as the fallback to D-05 Official Reading×Reader purchase admission. D-05's missing Thread case still returns unavailable until D05-C's pinned Bundle / exact Grant first-create contract and public release are separately accepted. Ordinary Chat, Reader-paid interpretation, Records and Chat Thread identities remain separate.

## D-05 server-only authenticated PostgreSQL orchestration

`apps/api/src/postgres-official-reading-reader-thread-resolution-v1.ts` now
composes the existing read-only authority ports **within one**
`executePostgresSubjectTransactionV1` call. It accepts verified authentication
evidence and Reading/Reader selectors, never a client or UI-provided Subject,
Thread, Product approval, Grant, content Bundle, or effective timestamp.

The entrypoint:

1. Rejects Guest and malformed selectors before borrowing the DB connection.
2. Resolves and transaction-binds canonical Member, with `SET LOCAL ROLE myeongha_api_executor`.
3. Obtains `transaction_timestamp()` from PostgreSQL, not the client's clock.
4. Receives the **Product/Commerce-approved eligibility authority-port factory**
   from trusted server code and binds it to that same transaction connection.
   No guessed approved Product rule is provided here; without this owner-owned
   implementation, an authorized positive resolution cannot be activated.
5. Calls the existing exact Reading×Reader Grant/source metadata, Product
   eligibility, bounded existing-thread locator and known-thread binding
   with replay checks; commits a read-only result or rolls back on mismatch.

This is an internal module, **not wired to a public API or mobile Reader CTA**.
The returned result is a short-lived internal lookup, not a reusable capability
or permission to issue an Official Reading Reader Chat turn. If a Member has
never created a general Reader Chat Thread, D-05 still fails closed. Do not
substitute the ordinary Member Chat open/create command, even though general
Web/Mobile Chat already uses it to display the default greeting.

Test evidence: `test/postgres-official-reading-reader-thread-resolution-v1.test.ts`
checks same connection and timestamp, Guest/bad inputs, revoked/missing Grant,
Product HOLD, zero/ambiguous Thread, bundle mismatch, and rollback/no-write.
The previous real PostgreSQL locator test proves row-level discovery behavior;
this new test uses injected PostgreSQL/Commerce ports and **does not** resolve
D05-A/C/D, #1827 refund/reveal linearization, #1828 Product policy mapping or
production deployment.
