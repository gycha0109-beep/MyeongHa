# M1-32 — Exact-commit Vercel serverless artifact evidence: fail-closed HOLD

> 2026-10-18 · Watchtower-Track: commerce · stacked Draft on M1-31 #2294. Only read-only Vercel metadata and synthetic tests. No deployment, promotion, rollback, live database SQL, private Writer, payment/refund or paid Reader activation.

## M1-31 exact-head CI confirmation

M1-31 [PR #2294](https://github.com/gycha0109-beep/MyeongHa/pull/2294), exact HEAD `81fa7a2c7387717f7fb8d92d43ef1cc269d38b33`: [CI 39112869752](https://github.com/gycha0109-beep/MyeongHa/actions/runs/39112869752) completed **SUCCESS** (Commerce, DB Authority Core, CI Verify), with Governance, Web PR Domain Gates and Web Auth Browser Regression all SUCCESS. The five DB dependency suites were scope SKIPPED; they are not additional PostgreSQL validation.

M1-31's actual `npm run build:web` produced and inspected **179 compiled static browser output files**. Its scanner found no configured private Reader/Writer identifier/source-map/private-file leaks and logged digest `ed6dd5046a3df877ccad0dd1ce2527b2cc6b9480a7bf38503880b96b80c4a7af`. **The digest is of local/CI browser files, not Vercel serverless function bytes.**

## Independent live Vercel metadata, read-only

The authenticated Vercel project is `myeongha`, project `prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP`. Read-only listing with explicit team scope confirmed these **production/main** deployments during this observation:

| Deployment ID | Main commit | Observed state |
| --- | --- | --- |
| `dpl_75wiaTqfBohQeXsxDRCYiNacZJmH` | `2d73b41500b6e6f3eb74ac358252602d0da686a7` | BUILDING at observation |
| `dpl_GKh3QtaHQrpiqMCtVnSATTYcZHXx` | `49010a99cc2a746c93662a0d115afd73705a8ab0` | READY |
| `dpl_BdqGVBHJe5N5BR2Utj5134hTpoTy` | `5f9f9d7f26a6c9054582e812344b7e385573a1b9` | READY |

A read-only deployment search filtered to the M1-31 PR's exact HEAD `81fa7a2c...` returned **zero deployments**. Both READY production deployments' file-tree reads via `GET /v6/deployments/{id}/files` returned **404 `file tree not found`** even with explicit team scope. They are not candidate Draft previews. The Vercel endpoint is generally a *source file tree* for supported deployment types; an available source tree should not automatically be construed as compiled serverless function bytes or an attested route/function manifest.

All three deployments are sampled observations, not an exhaustive historical statement, and the BUILDING deployment's later outcome was not checked. No Vercel deployment or project configuration changes were performed.

## M1-32 concrete implementation

- `scripts/operations/fixtures/m1-32-vercel-readonly-metadata-20261018.snapshot.json`: scrubbed, immutable observation of the known candidate SHA, project, three deployment IDs/states and the two 404 tree responses. No customer data, host secrets, source bytes or access tokens.
- `scripts/operations/m1-32-vercel-exact-sha-bundle-evidence.mjs`: pure/side-effect-free classifier requiring project ID, exact candidate SHA, unambiguous deployment ID, READY state, valid target, one matching file-tree read, nonempty content-addressed file manifest and independently demonstrated compiled function provenance. Its results **never authorize deployment**. A missing exact-SHA deployment → `HOLD_M1_32_NO_EXACT_SHA_DEPLOYMENT`; an exact ready deployment with 404 tree → `HOLD_M1_32_VERCEL_FILE_TREE_UNAVAILABLE`; only Git/source metadata → `HOLD_M1_32_SERVERLESS_BUNDLE_NOT_ATTESTED`; even apparent function hashes alone → `HOLD_M1_32_BUNDLE_BYTES_AND_ORIGIN_UNVERIFIED`.
- `apps/api/src/official-reader-vercel-bundle-evidence-m1-32.test.mjs`: ten Vitest cases covering current observed HOLD and deliberately falsified/ambiguous/missing SHA, candidate state, file tree, digest, private Reader path and untrusted self-declared function evidence.

The guard is automatically exercised by the Commerce CI test selection because the M1-32 file is in `apps/api/src`. It **does not** make production attestation artificially mandatory for an ordinary feature PR: CI can be green while the *independent deployment release verdict* remains HOLD.

## Required external evidence for future release assessment

Obtaining adequate evidence needs an authorized, independently attributable verifier capable of reading the **exact compiled serverless function bundle and route mapping**, tied to **deployment ID + project ID + immutable commit SHA + target**. Each function/route needs a reviewed file hash and a successful inspection or a documented independent binary/source-map analysis. A Vercel source-tree path listing without built-function proof is insufficient. In the currently available read-only connector workflow, these bytes could not be accessed; therefore **no candidate bundle has been inspected**.

Previous blocking evidence also remains: 2026-10-17 live migration parity discrepancy (45 reviewed source versions missing in live and one remote-only confidential SeYeon restore), managed Supabase Owner/GRANTOR, DR rehearsal and 15 independent Owner/recovery signoffs. The M1-28 trusted API identity/GUC boundary and M1-30 public-route source fence remain limited to their own tested scopes.

**Conclusion: HOLD for production API/Reader cutover.** This PR remains Draft/unmerged. No live SQL, payment, refund, D2 private Writer or paid Reader enabled.
