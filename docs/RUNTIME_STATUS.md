# MyeongHa Runtime Status

> This document describes executable production/runtime state separately from repository-local build, test, and deployment-configuration checks.

## Current status

| Area | State | Notes |
|---|---|---|
| Static Web | DEPLOYED | Vercel builds the static `public/` output through `npm run build:web`. |
| Executable `/api` runtime | NOT ACTIVE | The current Vercel configuration deploys static output only; no production API function/adapter is configured. |
| Browser → API | NOT ACTIVE IN PRODUCTION | Web runtime clients may reference `/api/*`, but production API transport is not deployed yet. |
| Canonical Subject Resolution | REQUIRED / NOT WIRED | Existing API use cases consume trusted `resolvedSubjectId`; the runtime identity-resolution boundary is not connected yet. |
| API → PostgreSQL execution identity | BLOCKED | `P0-AUTH-01` remains `OPEN-P0`; production user-data execution must not invent an RLS/execution model. |
| Character compatibility verdict | BLOCKED | `SRC-15` remains unresolved. |
| Subject-specific content rollout | BLOCKED | `SRC-16` remains unresolved. |
| Character HTTP activation | HOLD | Do not claim subject-specific activation while SRC-15/SRC-16 are unresolved. |
| Chat send/runtime activation | HOLD / FAIL-CLOSED | Do not invent compatibility or rollout fallback semantics. |
| Supabase production migration deployment | SEPARATE WORKFLOW | `.github/workflows/supabase-production.yml` performs remote migration deployment when triggered; local configuration verification does not prove current remote DB state. |

## Verification semantics

`npm run check` validates repository-local typechecking, tests, builds, static web output, and deployment-configuration contracts. It does **not** prove that a remote Vercel API runtime exists or that the current Supabase production schema matches this repository.

Remote production state requires separate production checks. The initial Integration Spine production contract is intended to become:

```text
GET /api/health
→ 200

GET /api/me
without valid member or guest identity evidence
→ 401
```

These endpoints are not considered active until an executable API runtime is actually deployed.

## Authority blockers

- `P0-AUTH-01`: API → PostgreSQL execution identity / RLS enforcement model.
- `SRC-15`: client capability / asset manifest compatibility decision authority.
- `SRC-16`: subject-specific content rollout resolver authority.

Do not close these gaps in lower-level implementation by inventing missing semantics.

## Canonical identity boundary

MyeongHa user-owned resources use canonical `subject_id` ownership. Authentication evidence and canonical product ownership are distinct concepts:

```text
authentication / guest evidence
→ trusted verification
→ canonical current subject resolution
→ resolvedSubjectId
→ existing API use case / AuthorityPort
```

A client-supplied `userId` or `subjectId` is not current-owner authority.
