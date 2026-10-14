# Official Reader PortOne cancellation Inbox: privacy decision & private cutover candidate v1

> 2026-10-14 (Asia/Seoul) / PRODUCT_OWNER conditional direction received in conversation
> Reference baseline: P0-PR-01 (DECIDED, 2026-09-19), P0-PR-01B (DECIDED)
> Scope: PortOne V2 signed cancellation notifications, **private development only**
> Legal status: statutory text cross-check, **NOT a Legal/Privacy Owner production sign-off**
> RELEASE: OFF / live PortOne connection: OFF / refund: OFF / entitlement revoke: OFF / retention deleter: OFF

## Source-of-truth and legal cross-check

1. `docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.md` approves **calendar P5Y** for its **enumerated nine Commerce evidence/history tables**, account personalization DELETE, existing encrypted backup **P30D**, and post-restore privacy deletion reconciliation before serviceability. This is **not** a blanket approval for new tables or indefinite storage.
2. `docs/COMMERCE_EVIDENCE_DATA_MINIMIZATION_DECISION_V1.md` approves minimized provider evidence and versioned keyed HMAC rather than raw bearer/receipt/payload archives.
3. `docs/COMMERCE_DIGITAL_READING_REFUND_DISCLOSURE_POLICY_V1.md` still requires Commerce/Legal review of final customer-facing cancellation disclosure and evidence.
4. Korean E-Commerce Enforcement Decree art. 6: contract/cancellation and payment/supply records: **5 years**; consumer complaint/dispute records: **3 years**. https://www.law.go.kr/lsInfoP.do?lsiSeq=288143
5. Korean Personal Information Protection Act art. 21 (effective 2026-09-11): erase personal data without delay when no longer necessary; preserve only where another law requires, separately from other personal data. https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0021&lsiSeq=283839&urlMode=lsScJoRltInfoR

The law does **not** prescribe 30 days for webhook technical intake. The following 30-day figure is a *product retention ceiling*, requiring a documented operational purpose (replay/idempotency/investigation); it is not a guaranteed minimum or a general right to retain personal data for 30 days after the purpose ends.

## Approved direction (limited, no operational activation)

| Evidence class | Decision | Boundary |
| --- | --- | --- |
| Unverified, signed inbound webhook **transport inbox** | Minimal identifiers / keyed HMAC only. **After independently verified, durable Commerce evidence is committed**, erase without delay once intake replay/reconciliation purpose ends; **no later than 30 days after completed transfer** absent separate lawful hold | 30 days is a **maximum**, not automatic holding period. No raw signed body, secret, HTTP headers, full provider response, card data, consultation, Birth, user profile |
| Verified **legal Commerce transaction/cancellation evidence** | Existing approved P5Y category **only when stored in a designated canonical Commerce evidence table and classified as a transaction/cancellation record** | Existing 1860 private shadow stream is not automatically among the enumerated nine tables. A shadow candidate cannot by itself prove refund completion |
| Complaint/dispute evidence | Separately classified and held as required; statutory example P3Y for complaint/dispute records | No blanket deletion of active disputes; exact legal grounds/clock and case management need Legal approval |
| Encrypted backups | Existing P30D lifecycle. Do not rewrite historical backup blobs on each deletion | Reconcile privacy deletion and expired inbox state after restore, before serving |
| Unprocessed/failed/ambiguous events | No silent TTL drop; must be observed, retried or escalated | HOLD until a proved disposition; non-infinite escalation/ageing contract and access controls required for LIVE |

## Implementable safety rules

- Verify authentic PortOne V2 HMAC-signature + timestamp **before** durable intake. Persist **typed minimal signed envelope** and a versioned keyed HMAC. Reject malformed or ambiguous cancellation IDs. Do not persist the raw notification or bearer credential.
- Commit inbox before HTTP success acknowledgement. GET payment independently **after** inbox commit, in a separately authorized worker; only verified facts may reach existing 1860 observation stream.
- Deduplicate on provider/environment/webhook ID. If an identical ID has different signed facts/HMAC, fail closed; never silently replace the old record.
- The private ingress table has no FK to `subjects`; this does **not** make provider IDs anonymous. Account deletion and privacy reconciliation still require an indirect-link inventory before production.
- The candidate table permits only QUEUED writes. Do not implement production processing-state advancement, automatic purge, SDK ingress, provider worker, consumer route, new runtime grants, refund, entitlement revoke or production cutover in this PR.
- Before implementing the deleter: prove completed-transfer atomic linkage to designated lawful evidence, privacy-specific retention job authorization, 30-day outer bound, early deletion when purpose ends, independent backup-restore reconciliation, and failed/held-event escalation.
- SQL role for private enqueue is **not granted to production API/service accounts**. Only tests/DB owner control it.
- A held or failed event is **not** equivalent to a lawful five-year dispute record without separate classification and purpose.

## Explicit remaining acceptance / ownership

- Product-owner direction for separated temporary vs legal evidence is recorded here. Independent **Privacy/Legal production sign-off** remains required for specific purpose, notice, retention timing, exceptional holds, subject deletion tracing and customer disclosure.
- Security/DB Owner: dedicated least-privilege caller, ingress audit, worker reliability, retention controller and backup/recovery tests.
- Commerce/Legal: which exact canonical event is a P5Y cancellation record; complaints/disputes P3Y treatment; whether the five-year retention clock begins at contract/cancellation or evidence timestamp; communication to user.
- Operations: retry/age monitoring, tombstone or deletion reconciliation, purge scheduling, recovery; incident procedures.

**Release gate: HOLD.** Product conditional approval here is not proof of regulatory compliance for any actual deployment.
