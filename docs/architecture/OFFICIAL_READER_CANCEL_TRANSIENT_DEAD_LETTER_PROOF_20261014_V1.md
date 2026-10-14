# D3e11 — Private cancellation manual retry: explicit transient-proof tightening

**Date:** 2026-10-14 · Parent: [D3e10 Draft #2078](https://github.com/gycha0109-beep/MyeongHa/pull/2078) · **HOLD (no LIVE or effects)**

## Incident / risk uncovered

The original `1920` D3e5 worker sweeps expired, eighth-attempt leases to `dead_letter` and writes `last_failure_code='LEASE_EXHAUSTED'`. A lease expiry shows **only** that a worker failed to finalize while its lease was live: it does **not** independently establish that the provider lookup was a harmless retryable failure. It could hide provider ordering uncertainty, a prior security classification, or an ambiguous in-flight transfer.

Previously `1930` D3e6 permitted a one-time privileged operator `retry_transient` on `LEASE_EXHAUSTED`. That was a silent promotion of UNKNOWN into TRANSIENT. A second issue arose from SQL three-valued logic: `last_failure_code NOT IN (...)` evaluates to NULL if the code is NULL; inside PL/pgSQL `IF` this can fail to reject a crafted dead-letter with no classification.

## D3e11 migration

`supabase/migrations/1960_official_reader_cancel_transient_retry_proof_private_v1.sql` replaces only `public.internal_private_cancel_review_v1(uuid,text,text)`; existing table columns, worker sweep, signer protocol, no-effects contract and operational permissions remain unchanged.

A `retry_transient` review now requires ALL:

1. `inbox_state='dead_letter'` and `attempt_count=8`.
2. **Non-NULL** `last_failure_code`, explicitly one of `LOOKUP_FAILED`, `LOOKUP_TIMEOUT`, `INTERNAL_FAILURE`.
3. No linked `shadow_observation_id` (an observation or ordering hold can never be replayed).
4. No prior `retry_transient` event for the inbox (also enforced by an existing unique partial index).
5. Valid `OPS-` ticket, row locking, `READ COMMITTED`, owner-only ACL and audit (all retained from D3e6).

`LEASE_EXHAUSTED` remains visible as a terminal ambiguity for manual investigation and is **NOT** requeueable. `acknowledge` remains available for allowed HOLD/dead_letter records, but cannot mutate their state or grant rights. No automatic retries are introduced. Existing dead letters are not backfilled, normalized or silently promoted.

## Isolated database acceptance

- `test/db/official_reader_d3e6_cancel_private_ops_review.sh`: eighth expired lease gets `LEASE_EXHAUSTED` and denied retry with zero audit mutations; repeats denial on NULL, `ORDERING_REVIEW`, `SOURCE_MISMATCH` even if the terminal row is crafted; eight-attempt `LOOKUP_TIMEOUT` recorded by the real worker failure RPC grants exactly one audited requeue; seven-attempt forged terminal is rejected; second retry remains impossible; held security mismatch is unchanged.
- `test/db/official_reader_d3e8_cancel_dual_approval_preflight.sh`: signed structural preflight cannot override an unknown lease-exhaustion classification; nonce/receipt and D3e6 audit remain unchanged on denial; explicitly classified eighth `LOOKUP_FAILED` can still be accepted once with a short-lived dual-signer sandbox receipt.
- Existing D3e7 aggregate/dead-letter alert tests continue to classify LEASE_EXHAUSTED for operational attention without auto-requeue.
- Migration checks expected prior `SECURITY INVOKER` function and preserves the role ACL. Schema catalog snapshot guard remains mandatory; pin only CI-computed fingerprint, never skip enforcement.

## Release limits

This does **not** prove that `LOOKUP_FAILED`, `LOOKUP_TIMEOUT` or `INTERNAL_FAILURE` is harmless in every context; their underlying D3e5 retryable classification remains an explicit bounded contract requiring further protocol and source-of-truth review. The DB owner can still bypass an application-level dual signature. D3e10 cryptographic permits still do not authorize LIVE execution.

No production grants, production rollback, account deletion executor, new P5Y evidence, refund, entitlement revoke or alert network delivery is enabled here. All Draft PRs remain HOLD until Security, Privacy, Commerce and Operations signoff.
