# Standard Reading → Character Reader Runtime: historical Seyeon-first staging

Status: **historical Seyeon-only internal preview; 2026-11-14 target is six Readers together; public paid Reader remains OFF**.

> **Current first Web launch authority:** [owner decision](LAUNCH_SCOPE_OWNER_DECISION_AND_TRACK_CLASSIFICATION_20261113.md) and [integration gate](LAUNCH_ROADMAP_CANONICAL_GATE_MATRIX_20261114.md) require **세연·라현·백헌·여울·윤호·태겸** all to support paid Official Reading viewing, a first question, and follow-up questions at initial launch, subject to individual approved Content Releases, models/Guards, exact Reader×Offer support, grants and end-to-end verification. This document records the older Seyeon-first **preview implementation**, not the first-release product target. The fail-closed preview cohort and public OFF remain until actual verified release. Unsupported combinations must not silently fall back to Seyeon.

## Seams, not duplicate authorities

- **Saju owns** Birth revision, calculation, canonical meaning, Official Reading artifact, Saju grounding evidence and version/hash.
- **Commerce owns** Product quote/purchase intent, provider verification, idempotent payment evidence, entitlements and fulfillment. Reader style never alters Saju source meaning or payment/entitlement authority.
- **Character/Reader owns** the chosen Reader's published content bundle, active single-character Thread, existing Reader grant, live Relationship/Memory, perspective and exact-context rendering.
- **App/Web own** the navigation, states, guarded rendering, error recovery and reading history re-entry. URL `reader` parameters are presentation hints only.

## Historical Seyeon-first preview stage (not current first Web launch scope)

Nine Reader identities remain supported in the shared runtime contract. Production internal-preview release admission recognizes **only `seyeon`** after server-side `prepareCharacterStandardReadingServerRuntimeV1` has resolved and checked the active Thread / delivered Official Reading / content bundle. Other eight Readers (and unknown identities) fail closed **before Saju grounding transport and text realization**, even if their display cards exist.

The public paid Reader API rewrite is still absent, Production activation defaults to `off`, and only the old bounded `internal_preview` subject cohort and Hosted Canary configuration can reach this runtime. This staged gate is **not** permission to start charging or publish paid interpretations.

## Flow on a future approved release

1. `Birth Profile` → Saju calculation → Official Reading and grounded canonical Product response (server authority).
2. Verified Product intent/payment/entitlement (Commerce); no frontend-paid flag.
3. Server-authorized Reader eligibility + pinned Character release; exact owner single-character Thread.
4. `threadId` + `officialReadingId` only into Reader runtime. Server re-reads granted Reader and Official artifact.
5. Server-side candidate release admission. Only after admission: bounded grounding projection → Character-specific interpretation → semantic preservation/guard → protected fallback or output.
6. Persist generated outcome through the explicitly approved fulfillment/Reading lifecycle, then re-open **the same** official record. Preview output is **not** silently persisted as paid fulfillment.

## Per-character verification gates for the six-Reader first launch

To activate each of the six approved launch Readers, the owning Character track must first deliver approved Character Bible/voice/behavior boundary, content bundle publication, pinned perspective, server-side grant test, semantic preservation benchmark, memory/relationship gates, and runtime canary. Commerce/Reading must separately validate paid fulfillment and re-entry for that Reader. Only after individual acceptance may the implementation expand its authorized set. **Do not** treat adding a candidate preview ID as a public paid release or grant all six automatically. Six-Reader simultaneous launch is the product target; activation remains OFF until all six pass.

## Acceptance & remaining blockers

- Historical implementation: nine canonical IDs in runtime contract, only Seyeon preview candidate; unknown IDs fail closed. Current launch target: six individually verified Readers, not a Seyeon-only public release.
- No browser Reader hint, payment claim or entitlement enters the Reader HTTP request.
- Candidate admission is after server Reader/Official Reading authority but before grounding/renderer.
- Production mode off + public route absent remain unchanged.
- Live end-user scenario **not completed**: Official Reading issuance, public paid Reader route, fulfillment persistence and payment operations still require their owning tracks' release approvals and canary.
