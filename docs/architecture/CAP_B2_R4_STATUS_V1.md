# CAP-B2/R4

Draft. Original matrix: Product PR #2003. No operational activation.

## Source and status

Original D-01 matrix lives in Product Draft #2003 (`STANDARD_READER_V2_BIND_POLICY_SPLIT_D01_TEST_MATRIX_V1.md`), not in this integration branch. R4 tracks 29 cases without treating inherited narrow PostgreSQL PASS as a full matrix PASS. Current Premium policy uses one `premium_character_bound(targetReaderId)` per Product; obsolete Reader allowlists are not implemented. No real checkout, paid Binder promotion or T2 output is authorized.

## Matrix coverage

BIND-01 unseeded approval: Product negative tests exist; Binder case incomplete.
BIND-02 Standard with no specialist capability: S4 PostgreSQL PASS.
BIND-03 specialist false: separate proof required.
BIND-04 Reader catalog, bundle, unlock: partial.
BIND-05 Product/spec/domain/Offer mismatch: partial.
BIND-06 future/withdraw/ambiguity: Product SQL and R3 concurrency partial PASS.
BIND-07 official nine Readers by domain: not yet complete.

BIND-08 Premium single target mismatch: negative Product policy; Premium Binder HOLD.
BIND-09 Premium target match but specialist false: no Standard fallback; private R4 PG subset.
BIND-10 Premium target match and specialist true: actual commerce/authorization HOLD.
BIND-11 malformed or multiple Premium targets: Product SQL constraint subset.
BIND-12 client policy/Reader spoof: Binder snapshot guard; integration incomplete.
BIND-13 pending/unverified/sandbox/missing Grant: R1/R2 partial only.
BIND-14 one initial official Reading + one Reader Access: S4 actual PG PASS.
BIND-15 additional Reader exact purchase: S4 predecessor PG PASS.
BIND-16 missing additional source / drift: integration incomplete.
BIND-17 historical replay after revoked Grant: R2 PG partial PASS.
BIND-18 request hash/bundle conflicts: existing tests partial.

BIND-19 one Grant revoked, another independent bundle Grant preserved: integration incomplete.
BIND-20 cross-Subject/Reading/Reader, Guest-to-Member lineage: full test incomplete.
BIND-21 legacy 1170 vs v2 history: no auto-entitlement upgrade; unproven across all paths.
BIND-22 T2 scope lock before issuer: operational T2 Writer HOLD.
BIND-23 revoke before Binder: R2 actual PG PASS; T2 reveal HOLD.
BIND-24 Product withdrawal vs initial Binder: R3 actual PG 2/2 PASS.
BIND-25 Grant expiry after lock wait: elapsed-clock PG case missing.
BIND-26 stale REPEATABLE READ/SERIALIZABLE snapshot: existing guard, new R4 PG subset.
BIND-27 multi Reader scope sorting: R3 actual PG PASS; global multi-scope proof incomplete.
BIND-28 old 1220/API/Commerce bypass: R3 runtime HOLD inventory passed; real ingress integration missing.
BIND-29 Product withdraw + Content retire/Unlock/T2 race: integration HOLD.
