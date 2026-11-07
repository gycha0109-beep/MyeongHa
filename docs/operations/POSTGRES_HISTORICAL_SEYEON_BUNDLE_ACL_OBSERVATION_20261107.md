# Phase 8-A — Historical Se-yeon bundle: current effective authority snapshot

> Date: 2026-11-07 KST
> Track: `ops` / Repository: `gycha0109-beep/MyeongHa`
> GitHub comparison main: `21ddb3192d8ad3f671e3cabaebec5089fc5e82c3`
> Production project: `cnsfpcdiyofqvhpcegfc`
> Reproducer: `scripts/operations/production-historical-seyeon-bundle-acl-readonly.sql`
> Status: **BOUNDED READ-ONLY EVIDENCE ONLY — Phase 8-A NOT ACCEPTED**

## Exact live observation

Both query parts were run against the existing Production PostgreSQL 17.6 using explicit `BEGIN TRANSACTION READ ONLY` and `ROLLBACK`. No schema, role, data, token or configuration was changed.

| Scope | Observed |
|---|---|
| Remote-only applied history | `20261008090417`, one stored statement |
| Lexical function declarations | 19 distinct |
| Current same-name, same-schema functions | 19 / 19 |
| Live overload multiplicity | 19 function rows, 0 overloaded names |
| Current SECURITY DEFINER functions | 17 |
| SECURITY DEFINER functions without `search_path` configuration | 0 / 17 |
| Effective `EXECUTE`, `anon` | 0 / 19 |
| Effective `EXECUTE`, `authenticated` | 0 / 19 |
| Effective `EXECUTE`, `service_role` | 0 / 19 |
| Effective `EXECUTE`, `myeongha_api_executor` | 17 / 19 |
| Function owner distribution | relationship apply owner 5; chat runtime owner 9; post-turn owner 4; `postgres` 1 |
| Current same-name policy presence | 19 / 19 |
| Current policy command distribution | SELECT 12; INSERT 4; UPDATE 3 |
| Declared-policy tables with RLS disabled | `public.chat_turns`, `public.chat_turn_attempts` |
| Direct table/column privileges on these two tables | All tested SELECT/INSERT/UPDATE/DELETE (table), SELECT/INSERT/UPDATE/REFERENCES (column) denied to each of `anon`, `authenticated` and `myeongha_api_executor` |

These are observed current-state access conditions. Disabled RLS is **not** repaired merely because direct grants are absent: a future grant, a changed function path, a different invoker or a restored schema may change effective access. Policy-name presence alone does not enforce RLS.

## What this establishes / does not establish

- **Established:** On this observed Production frontier, the named historical function/policy catalog is present and the checked ordinary-request roles cannot directly access the two RLS-disabled tables.
- **Not established:** Full function argument/body equality, historic wrapper statement equivalence, exact policy expressions, direct grant and membership graph equivalence to source, provider migration-ledger restoration, isolated restore parity, or authoritative actor/deployment provenance.
- Historical personal actor/request/COMMIT forensics remain `CLOSED_RISK_ACCEPTED` under the existing roadmap and are not reintroduced as a blocker.
- Keep `dr_ready=false`, `serviceResumptionAllowed=false`, Issue #1887 OPEN and Phase 8 BLOCKED.

## Next accepted-roadmap actions

Continue Phase 8-A by comparing the stored `20261008090417` wrapper/owner/GRANT/REVOKE/policy expressions with today's complete catalog and the isolated restore. Only source-backed discrepancies should receive a forward-only reconciliation proposal. No Production SQL/DDL, migration repair, privacy canary, Hosted DR project, secrets or traffic changes are authorized by this observation.

Watchtower-Track: ops
