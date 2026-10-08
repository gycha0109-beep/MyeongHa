# Standard Reading → Character Reader Runtime: Seyeon-first staging

Status: **server-side internal-preview admission added; public paid Reader remains OFF**.

## Seams, not duplicate authorities

- **Saju owns** Birth revision, calculation, canonical meaning, Official Reading artifact, Saju grounding evidence and version/hash.
- **Commerce owns** Product quote/purchase intent, provider verification, idempotent payment evidence, entitlements and fulfillment. Reader style never alters Saju source meaning or payment/entitlement authority.
- **Character/Reader owns** the chosen Reader's published content bundle, active single-character Thread, existing Reader grant, live Relationship/Memory, perspective and exact-context rendering.
- **App/Web own** the navigation, states, guarded rendering, error recovery and reading history re-entry. URL `reader` parameters are presentation hints only.

## First release stage

Nine Reader identities remain supported in the shared runtime contract. Production internal-preview release admission recognizes **only `seyeon`** after server-side `prepareCharacterStandardReadingServerRuntimeV1` has resolved and checked the active Thread / delivered Official Reading / content bundle. Other eight Readers (and unknown identities) fail closed **before Saju grounding transport and text realization**, even if their display cards exist.

The public paid Reader API rewrite is still absent, Production activation defaults to `off`, and only the old bounded `internal_preview` subject cohort and Hosted Canary configuration can reach this runtime. This staged gate is **not** permission to start charging or publish paid interpretations.

## Flow on a future approved release

1. `Birth Profile` → Saju calculation → Official Reading and grounded canonical Product response (server authority).
2. Verified Product intent/payment/entitlement (Commerce); no frontend-paid flag.
3. Server-authorized Reader eligibility + pinned Character release; exact owner single-character Thread.
4. `threadId` + `officialReadingId` only into Reader runtime. Server re-reads granted Reader and Official artifact.
5. Server-side candidate release admission. Only after admission: bounded grounding projection → Character-specific interpretation → semantic preservation/guard → protected fallback or output.
6. Persist generated outcome through the explicitly approved fulfillment/Reading lifecycle, then re-open **the same** official record. Preview output is **not** silently persisted as paid fulfillment.

## Per-character expansion gates

To promote any future Reader, the owning Character track must first deliver approved Character Bible/voice/behavior boundary, content bundle publication, pinned perspective, server-side grant test, semantic preservation benchmark, memory/relationship gates, and runtime canary. Commerce/Reading must separately validate paid fulfillment and re-entry for that Reader. Only then add that exact ID to the server-side internal-preview candidate set and update rollout presentation; **do not** enable all Reader IDs at once.

## Acceptance & remaining blockers

- Nine canonical IDs in runtime contract, only Seyeon candidate; unknown IDs fail closed.
- No browser Reader hint, payment claim or entitlement enters the Reader HTTP request.
- Candidate admission is after server Reader/Official Reading authority but before grounding/renderer.
- Production mode off + public route absent remain unchanged.
- Live end-user scenario **not completed**: Official Reading issuance, public paid Reader route, fulfillment persistence and payment operations still require their owning tracks' release approvals and canary.
