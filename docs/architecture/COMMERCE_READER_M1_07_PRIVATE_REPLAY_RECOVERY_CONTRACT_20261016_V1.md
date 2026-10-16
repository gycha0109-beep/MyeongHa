# M1-07 — Private, replay-only Official Reader recovery contract

> 2026-10-16 · Commerce Track · Draft-only / no runtime credential or DB ACL change

## Why this slice is safe to implement now

M1-02 through M1-06 proved isolated PostgreSQL receipt persistence, atomic issuance/binding, actual app-role denial, transitive `SECURITY INVOKER` denial, and **original effect-semantic** replay. None authorizes an actual production private issuer. Production-first issuance would require review of the dedicated execution identity, its transitive DB authority, capability validity anchor, pinned Reader selection, commerce/legal saleability and the exact D1 lock boundary.

This PR therefore implements a narrower **recovery-only** TypeScript port for receipts which already have **all** of:

- a production `1050`-verified Receipt with a verified Purchase Intent and pinned capability snapshot;
- exactly one pinned Capability Item (current Standard Reader slice), an active purchased Grant and its original immutable `granted` Event, with exact effect/validity/reason semantics;
- an already committed Reader Access row tied to that Grant and a corresponding Official Reading;
- the server-persisted original binder request hash and contract.

**Unissued, unbound, missing, duplicate, revoked, expired, ambiguous or otherwise incomplete evidence yields HOLD before any D2 mutation.** This cannot issue a new Grant. Multi-capability fulfillment is intentionally unsupported here, not silently narrowed to one item.

## Source and transaction authority

`apps/api/src/official-reader-private-replay-recovery-v1.ts` exports only an internal function `recoverAlreadyBoundOfficialReaderReceiptV1`. It receives an opaque Receipt UUID and a **private transaction port**. It does not create a PostgreSQL pool, obtain a production secret, select an app role, export an HTTP endpoint, subscribe to a webhook, or call the existing provider-completion orchestration.

Inside one port-owned transaction:

1. Resolve original Receipt→Intent→Capability→Grant→Event→Reader Access→Official Reading with a **read-only DB query**. No Product, Subject, amount, Reader selection or effect time comes from browser input.
2. Reject any result other than one fully qualified row; even the original `eventId`, `effectiveAt`, `validFrom`, `validUntil`, `reasonCode`, bind request hash and Reading must exist in storage.
3. Set transaction-local canonical subject context from the DB-owned Receipt row.
4. Invoke the existing **D2 1820 private issuer** with exactly the persisted effect semantics; it must return the same Grant with `result_replayed=true`.
5. Invoke the existing **D2 1820 private binder** with exactly the persisted request hash and DB-resolved Reader/Reading provenance; it must return the same Reading and Grant with `replayed=true`.
6. Recheck the current active Grant and exact bound Reader row inside the same transaction, after the D1/D2 lock and effects. Any mismatch throws, requiring the port to ROLLBACK. No paid body is released, even on success.

The `PrivateOfficialReaderRecoveryTransactionPortV1` is intentionally **not implemented** for the production application. A TypeScript interface is not an authorization primitive. The eventual real implementation must guarantee BEGIN/COMMIT/ROLLBACK and use a DB/Security-approved private issuer credential and transitive grants without broadening `myeongha_commerce_internal_executor`, `myeongha_api_executor` or `service_role`.

## Executable evidence

- `apps/api/src/official-reader-private-replay-recovery-v1.test.ts`: successful replay carries exact DB event parameters; unissued/unbound/ambiguous cases HOLD; invalid input invokes no transaction; errors, non-replay issuer/binder returns and current Grant revoke trigger transaction rollback; every result has `publicDisclosureAuthorized:false`.
- `test/db/official_reader_m1_07_private_replay_source_sql.sh`: extracts **the literal query from the TypeScript source** and executes it in PostgreSQL against an actual `1050` verified Receipt + D2 issued/replayed Grant/Reading after M1-06. It also verifies missing Receipt has no recovery authority. This is a query-contract integration test, **not** a full live TS caller or credential E2E.
- The existing PostgreSQL 15 Content suite and db-authority-core route the fixture; exact HEAD and actual job results must be reported.

## Future acceptance before any first-issue actor

The real first-issuance path still needs an approved private issuer identity and transient source-derived validity anchor for pinned Capability Item modes. `1090` explicitly does **not** derive the initial anchor or provider-specific expiry. It also needs a full reviewed Product/Reader policy and transaction-bound D2 issue/bind with failure retry, anti-bypass role grants and deployed credential custody. The Saju production T8 interpretation rule pack remains NO_BUILD, and Product Offer/Charge Terms, protected paid T2 and saleable activation are HOLD.

No deployment, production GRANT/REVOKE, live payment/refund, public route, paid text or Draft merge is included.