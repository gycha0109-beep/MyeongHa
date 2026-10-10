# RR-03 Owner-approved private Saju provenance — delivery gates

**Track:** db-authority-core  
**Owner decision:** https://github.com/gycha0109-beep/MyeongHa/issues/1884#issuecomment-6103479019  
**Approved:** 2026-10-11 KST, personal-data retention **DELETE**, deny after revoke/refund/expiry; Reader Chat PUBLIC **OFF**.

## Versioned privacy policy

- Historical approved 2026-09-19 P0-PR-01 baseline stays immutable: 59 subject-reachable tables, 140 edges, DELETE 46 / ANONYMIZE 4 / RETAIN 9, fingerprint `c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b`.
- New additive privacy graph `TRANSITIVE_SUBJECT_DEPENDENCY_GRAPH_RR03_V2.json` holds 60 tables / 146 edges. Six new FK paths, only to `official_reader_assistant_saju_provenance`.
- New independently authorized disposition `ACCOUNT_DELETION_DISPOSITION_POLICY_RR03_V2.json` maps 60 of 60 tables. New classification **DELETE**; result 47 DELETE / 4 ANONYMIZE / 9 RETAIN, no change to P5Y Commerce evidence or P30D backup baseline.
- New `ACCOUNT_DELETION_FINALIZATION_POLICY_RR03_V2.json` explicitly records the conversation-message FK cascade and backup reconciliation. It does **not** activate destructive SQL, assert DR readiness, or rewrite historical #964 approval.

## Database guardrail

Migration `1710_official_reader_assistant_provenance_storage_v1.sql` (not colliding `1660`) creates a dormant FORCE-RLS, no-runtime-policy table with six subject-reachable FKs, immutable protected data, bounded Saju units/disclosures/ambiguity, and no API role table privilege. Null focus is allowed for safe follow-up clarification. No LLM UUID or user-provided metadata is a verified official source.

The existing approved account-deletion finalizer deletes `conversation_messages`; the sidecar is FK `ON DELETE CASCADE` bound to the same message/turn/subject. **Populated-row finalizer, authenticated restoration/replay and live PG role checks still require passing isolated integration evidence**; a catalog-only result cannot assert privacy restoration works.

## Unshipped commitments

- Actual trusted server-attested RR-06 semantic/output proof and RR-09 source snapshot must be committed atomically with the assistant message; generic existing `cmd_commit_chat_turn_v1` cannot validate Saju unit source provenance.
- Owner-approved #1827 exact Grant/refund T2 lock contract, non-BYPASSRLS runtime Executor + output/public send ordering.
- RR-04 latest valid Assistant query and real role/tenant/reading/revoke E2E.

**Activation gate:** no Writer, no Anchor Query EXECUTE, no new public Reader Chat, no Product Offer, no model activation until entire positive-path security and deletion/restore matrix passes.
