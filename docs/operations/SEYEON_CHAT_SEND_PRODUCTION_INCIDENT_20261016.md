# P0 Incident — Seyeon Chat Send 500 on Production schema frontier (2026-10-16)

Watchtower-Track: security
Incident: https://github.com/gycha0109-beep/MyeongHa/issues/2200

## Reproduced evidence (read-only)

- Vercel: POST `/api/chat/:threadId/turns` 500 at 2026-10-16T08:16:21Z and 08:16:30Z, `stage=chat_execution`. SQLSTATE 42883 followed by P0001.
- Supabase postgres log: `function public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid, uuid, uuid, jsonb) does not exist` at 08:16:21.317Z.
- Production `pg_proc`: function missing; legacy unpinned 3-argument `cmd_mark_seyeon_chat_context_ready_runtime_v1` **still executable** by `myeongha_api_executor`.
- Production `supabase_migrations.schema_migrations`: last numbered applied migration 1510. Version `20261008090417` is remote-only. 1520–1720 not applied.
- Production `chat_turn_attempts` missing `seyeon_personal_source_pin_jsonb`, `seyeon_personal_source_pinned_at`, and the immutable/Commit guard trigger of 1640.
- Exact affected Chat Thread returned one logical Turn in `failed_retryable` with one failed attempt, code `SEYEON_PRODUCTION_EXECUTION_FAILED`. This metadata check did not expose a Member's chat text. P0001 on retry is NOT yet independently attributable to a particular named constraint because runtime diagnostics only exposed the SQLSTATE.
- Existing `apps/api/src/postgres-seyeon-production-chat-execution-v1.ts` already **requires** pinned RPC; switching to old 3-arg RPC would allow execution before durable source Pin. **Forbidden**.

## Fix this PR

Detect exact pinned RPC and Member executor EXECUTE using read-only catalog lookup **before** DB Chat Turn receive/attempt allocation. If missing, return structured HTTP 503 `CAPABILITY_UNAVAILABLE`, preserving Member draft and idempotent retry. Query runs under already-authorized canonical Member Subject transaction; no optimistic preview/AI execution; no new DB privileges.

This is a **safe failure-mode fix, not a claim of Chat send restored**.

## Production recovery runbook — separate, gated Operations release

1. Establish exact Production database frontier, roles, 1640 SQL fingerprint and remote-only history including `20261008090417` (already observed). Do **not** falsify history or force `db push`. `1640` alone cannot be applied as a timestamp-named emergency migration without planning later numbered migrations and the original 1640 replay conflict.
2. Ops/DB/Security owners verify current encrypted backup plus isolated restore from **the same backup**, new authoritative recovery evidence and forward-only sequencing for 1520–1720. Explicitly resolve past migrations, object fingerprints, ROLE/ACL ownership, and cost/read/reader schema impact. Do not apply all 21 without review.
3. Review 1640 existing SQL: nullable Pin columns, immutable trigger, strict zero-proof shape, owner-protected `cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)`, revocation of legacy 3-arg entry's EXECUTE, and the original Pin comparison at Commit. Pin check must precede all provider calls.
4. After owner-approved governed production migration: verify `to_regprocedure` and executor EXECUTE true, legacy executor EXECUTE false, and immutable source Pin schema/trigger. Prove scope/isolation on isolated PG17 first and exact SHA.
5. Run an **authorized** Member send with the original idempotent pending `clientTurnId`: verify failed_retryable → next attempt → context_ready → generated/validated/committed, without double user-message insertion or duplicate paid calls. Investigate any remaining P0001 via constraint-safe server diagnostics.
6. Full Integration, exact main CI, production postdeploy verification, scoped device acceptance. Re-enable only upon recorded success. **Do not mark restored from 503 alone.**

## Non-goals
No production writes were made during this PR or incident catalog inspection. No arbitrary ACL escalation, schema patch, grant/owner bypass, paid/public Reader activation, Chat text retrieval or idempotency reset. Existing governance document `docs/operations/SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md` keeps production migration release on HOLD without complete approval/evidence.
