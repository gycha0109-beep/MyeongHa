# RR-04 private latest-assistant anchor candidate (offline)

**Watchtower-Track:** db-authority-core  
**Parent:** RR-03 private DELETE sidecar PR #1960, migration 1720  
**Change:** proposed migration 1730 (stacked, review-only)  
**Status:** Private candidate implemented; production adapter/query, Writer and public Chat **OFF**

## Supported checks

`public.internal_qry_official_reader_followup_candidate_v1(subject_id,thread_id,reader_character_id,reading_ref)` is a **SECURITY INVOKER**, no-EXECUTE, read-only DB candidate. It requires trusted current Subject context and checks:

- Active canonical Subject, active pinned single-Reader Thread, exactly one current purchased Reader Reading-access metadata row; no cross-bundle ambiguity.
- Exact official Reading, Product, version, official source response hash, current Reader bundle and Release/Revision provenance against the private 1720 sidecar.
- The **newest** character message for this Reader in the Thread; any later unvalidated/redacted/uncommitted or missing-provenance message suppresses older candidates. No fallback to older evidence.
- Committed Turn, committed Attempt bound to the exact committed message, Output Guard version, unredacted message/utterance hash and bounded sidecar source Unit IDs.

The function returns candidate columns matching the shape required for future safe read, but **its name intentionally differs** from `qry_official_reader_followup_anchor_runtime_v1`. The app-side PostgreSQL adapter remains fail-closed while the latter is absent. No roles (`anon`, `authenticated`, `service_role`, `myeongha_api_executor`, Se-yeon runtime) receive EXECUTE, nor direct provenance table SELECT. No generic `SECURITY DEFINER` shortcut is introduced.

## Still required before positive DB authority

1. The RR-03 Writer must verify **source-originated** Saju grounding Unit closure, RR-06 semantic guard, Output Guard, RR-09 current admission, utterance hash and Product rule in **the same trusted commit transaction**, with current Grant/refund/revoke T2 lock semantics.
2. Product/Commerce's approved eligibility rule is currently exposed through a separate **server-owned Product authority port**; the database candidate cannot independently certify its latest revision. An external successful Product check does not authorize unguarded read/reveal, nor remove the T2 locking requirement.
3. Exact non-BYPASSRLS runtime role, permissions and RLS policies for any release candidate must be reviewed and tested on real PostgreSQL 15/17, including active/revoked/refunded/expired and wrong Subject/Reader/Reading/Bundle/Release cases.
4. Provenance deletion must survive actual account finalization and authoritative post-backup privacy reconciliation. Current live Production migration history remains HOLD; do not auto-run 1730 on Production.

## Test boundary

The PostgreSQL catalog/test suite establishes function exists, is INVOKER and **ungranted**, with negative synthetic proof cases (uncommitted latest message; wrong Reader; wrong transaction Subject). These are not positive production Writer/query E2E evidence. The original RR-03 populated DELETE and FK cascade regression remains in the same fixture.

**Decision:** stage internal candidate and its tests only. Do not create the adapter-bound public function or activate Reader Chat until RR-03, Product and DB Owner approval gates close.
