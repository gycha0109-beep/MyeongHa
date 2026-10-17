# M1-25 — PostgreSQL 17 independent non-superuser migration executor and SECURITY DEFINER Owner gap

> 2026-10-17 · Watchtower-Track: commerce · stacked Draft on M1-24 #2267 · isolated CI only. **Do not deploy or alter production.**

## Exact question tested

M1-24 proved independently authenticated application roles could exercise the checked-in API minimal-read (1970), deny private D2 Writer access, and resist unauthorized ownership/GRANT attempts. Its *source migration executor* and 1970 SECURITY DEFINER function Owner, however, were both stock CI superuser `postgres`. This cannot establish Supabase's non-superuser migration-executor/Owner contract.

M1-25 adds a separate PG17 case: replay the pinned repository source set, deliberately **withholding 0860** (already covered in its own dedicated PG17 non-superuser role-migration test) **and 1970** (the subject under test). Connect a newly provisioned, `LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS` independent synthetic migration principal directly over TCP. Then execute **the exact checked-in 1970 SQL file** twice under that principal, first without and then with **temporary schema CREATE**:

| Test boundary | Required result |
|---|---|
| Source SHA preflight | M1-20 exact reviewed SHA pin for all 45 missing-in-live SQL sources; drift blocks test |
| Independent TCP login | `session_user=current_user` synthetic principal, `NOSUPERUSER`, `NOCREATEROLE`, `NOBYPASSRLS`; no role memberships |
| Real 1970 SQL with no schema CREATE | **SQLSTATE 42501** and atomic rollback; 1970 function must not exist |
| Fixture-only narrow `CREATE` on public schema | Apply exact 1970 SQL under independent non-superuser `psql -1`; no special user-data privileges |
| Privilege cleanup | Explicitly revoke schema CREATE; verify owner has no residual CREATE or role memberships |
| Owner, definer and ACL catalog | Newly created minimal-read function **owned by restricted synthetic principal**, `SECURITY DEFINER`, pinned `search_path`; only API EXECUTE, no PUBLIC/anon/service EXECUTE |
| Reader API NULL-input call | API runtime `SET LOCAL ROLE` reaches SQLSTATE **23514** guard without reading a real Receipt |
| M1-18 catalog safety | Full API minimal read and private D2 Writer ACL checks plus four transactional negative probes remain closed |

All SQL mutation is confined to a per-case disposable database. A random password is generated in CI and never checked in; the synthetic function and principal are removed during fixture cleanup. No external Provider calls, real user data, migrations ledger alteration or paid Reader activation.

## Specific newly visible functional HOLD

A `SECURITY DEFINER` function runs with the **function Owner's** privileges. Executing the 1970 migration as a non-superuser with CREATE rights can succeed and grant the API entrypoint, **without granting that Owner SELECT on the private Receipt/Grant/Entitlement/Reader/Outbox source tables**. The test explicitly checks that the synthetic Owner has SELECT on **zero of these five tables** and emits `HOLD_M1_25_DEFINER_SOURCE_READ`. The NULL-input guard passing is **not proof that non-NULL reconciliation queries could read the required source data**.

Therefore, a passing M1-25 CI proves only *the narrower property*: this specific source SQL can be installed by a restricted independent executor during a narrow CREATE window, and the resulting API/Writer ACLs remain closed. It also supplies negative evidence that successful DDL does **not** imply functional/security equivalence to the actual owner of a restored Supabase database. Do **not** grant private table SELECT to an arbitrary runtime account to make this synthetic test green; actual production source/owner/role provenance must be obtained and reviewed separately.

## Role/restore and cutover boundaries still unresolved

- `0860` owner creation requires PostgreSQL 16+ **ADMIN-only** creator membership with superuser grantor and `INHERIT/SET FALSE`; existing `birth-profile-create-runtime-authority` CI tests this in a distinct managed-principal fixture. M1-25 does **not** claim its entire 0860 behavior was replayed in the 1970 source-case DB.
- CI bootstrap superuser still initializes the upstream schema. The 1970 test's principal is a new synthetic LOGIN role, **not** the actual Supabase-managed migration executor or an attested production definer Owner; role delegation, source-table privileges, RLS and restore provenance can differ.
- Live observation dated 2026-10-17: 173 installed versions, 217 repository SQL files, 45 absent-in-live reviewed versions, one remote-only SeYeon `20261008090417` (104,021 bytes/MD5 pinned); the remote incident SQL, six empty historical marker statements and real data are **not replayed**.
- No independently approved production-equivalent nonproduction restore, full migration-history repair, transaction crash/recovery DR drill, real effective SQL identity, or per-domain Owner approval. The 15 outstanding M1-22 checklist items remain.
- No production DDL/GRANT, migration ledger writes, payment/refund, D2 private Writer enablement, unapproved subject/Receipt read or paid Reader activation.

**Operational decision: HOLD** regardless of CI status. The next proper external evidence is a permitted *read-only* target-role, owner/definer and source ACL inventory under DB Security/Privacy custody, plus authentic restore and DR evidence. This PR is not an operational authorization.
