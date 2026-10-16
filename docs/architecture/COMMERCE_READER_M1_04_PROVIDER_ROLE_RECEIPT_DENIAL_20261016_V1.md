# M1-04 — Production-call-path roles vs. persisted Receipt and D2

> 2026-10-16 · Watchtower-Track: commerce · Draft-only; isolated PG15 fixture

## Actual roles and verified flow

- Member-side Purchase Intent/Payment Attempt uses `SET LOCAL ROLE myeongha_api_executor` via `postgres-subject-execution.ts`.
- Provider-side verification-context lookup and `1050` verified evidence persistence use `SET LOCAL ROLE myeongha_commerce_internal_executor` via `postgres-commerce-internal-execution.ts`.
- `1050` grants the Commerce executor the narrow `cmd_persist_verified_payment_evidence_v1` capability, which writes Attempt/Intent/Receipt/Provider Event but **does not apply an entitlement effect**.
- D2 `1820` contains private SECURITY INVOKER `internal_apply_official_reader_unified_receipt_v1` and `internal_cmd_bind_official_reader_unified_v1` with runtime EXECUTE denied. Security Draft `1900` also fences legacy `1090` issuer `internal_apply_verified_receipt_capability_effects_v1`.
- An isolated DB owner may call D2 in a test; that does not imply any deployed API executor or Worker can or should call it. There is still **no authorized production-equivalent issuer**. Leave the G-01 caller integration gap open.

## New executable integration check

`test/db/official_reader_m1_04_provider_role_execute_deny.sh` is invoked immediately after **actual `1050` persistence** and before the isolated owner issues a Grant. It runs on the existing Content DB Suite fixture only, with a disposable `CI=true`, `PGHOST=localhost`, `PGUSER=postgres`, `myeongha_ci_case_*` database guard.

The test:

1. Rechecks exact 1050-persisted verified Receipt × Subject × Purchase Intent lineage and zero purchased Grants.
2. Enters **both application transaction roles** using actual PostgreSQL `SET LOCAL ROLE`, not a catalog-only ACL query.
3. Attempts D2 issuer, D2 binder, and legacy 1090 issuer on that specific verified Receipt. All six calls must return SQLSTATE `42501`, with explicit `permission denied for function`; any other failure (input shape, context, role switch, or unexpected SQL success) fails.
4. Confirms Receipt is intact and zero Grant or Reader access rows were created; the existing M1-03 private owner rollback/retry then executes unchanged.

This is **not** a repeat of broad D3e23–29 `service_role`/table/SECURITY DEFINER audits. It answers whether the two actual API SET ROLE targets can transform **the real provider-originated Receipt** into a Reader Grant. They should not.

## Further development gate

The next buildable work must define an **explicit, server-owned, privately authenticated issuer transaction** that has least-privilege access to the actual D2 1820 functions and can issue/bind atomically with correct Product L0 → Reading×Reader L1, verified Receipt, pinned Reader selection, idempotent replay and failure rollback. It must avoid broadening the existing generic Commerce role. The owner/credential/DB grants are **not approved**, so no runtime role migration or deployment activation is made.

M2 Saju content, Content Release, Offer/Charge Terms and legal/privacy release gates also remain HOLD; passing this isolated test is not proof of saleability or positive T2.

## CI evidence

Record the exact PR HEAD and actual PG15 `DB dependency · content / content` logs before marking PASS. Skipped PG17 and live credential verification must remain distinct from passed tests.
