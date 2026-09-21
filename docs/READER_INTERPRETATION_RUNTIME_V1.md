# Reader Interpretation Runtime V1 — Preview E2E

Status: **implementation candidate / Preview only**

## 1. Purpose

This runtime consumes exactly one already-authorized **Official Reading Source Truth** and renders a Reader-specific presentation without creating a second Reading or changing Saju meaning.

Authority chain:

```text
server-resolved subject
  -> owner-authorized active thread
  -> exact pinned immutable content release
     -> authored Reader Character + world canon
  -> current relationship authority
  -> active Memory Items + exact Reader grants
  -> Reader Knowledge Official Reading source resolver
     -> exact Reader access authority
     -> exact Reader-scoped raw Official Reading artifact authority
  -> protected Official Reading contract validation
  -> Saju-owned Character Grounding projection port
  -> positive Character Grounding bundle admission
  -> admitted Character perspective
  -> deterministic bounded renderer
  -> semantic preservation guard
  -> ReaderInterpretationEnvelopeV1
```

The Reader Knowledge source resolver is the authority merged by PR #1142. This runtime reuses that boundary rather than introducing another Reader-access authority path.

## 2. Non-negotiable invariants

- Official Reading identity and Source Truth hash are unchanged across Readers.
- Reader access is exact-subject + exact-Official-Reading + exact-Reader.
- Reader access and the raw Official Reading artifact are independently re-resolved server-side.
- Browser Reading handoff, `sessionStorage`, query topic/scope, and client-carried Reading prose are never Source Truth.
- Runtime Character identity must match the Reader admitted by the Official Reading source resolver.
- Grounding is requested only from the Saju-owned projection boundary after Official source resolution; the browser/caller cannot supply semantic grounding directly.
- Grounding `readingRef`, domain, Product Reading response contract version, engine version, `sourceResponseHash`, and `groundingHash` must match the admitted Saju projection/context.
- The committed DB `reading_refs.response_hash` is an opaque Official-artifact provenance value and is **not** assumed to be the same hash contract as Saju `sourceResponseHash`. Both are carried separately.
- The admitted official source must be `delivered` or `delivered_with_fallback`; non-delivered Product Reading states fail closed.
- Semantic lines come only from selected grounding units.
- Character framing comes only from already-published safe-framing authority.
- Protected-only material fails to protected fallback.
- The envelope never embeds or duplicates raw `ProductReadingResponse` / `response_snapshot_jsonb`.
- No new official Reading is created by this runtime.
- No Production Saju, Product Offer, Charge Terms, or payment activation is introduced.

## 3. Current executable slice

The runtime is intentionally perspective-agnostic: it receives an already-admitted `CharacterPerspectiveProfileV1` and does not invent Character-to-grounding mappings.

Current repository authority already admits explicit mappings for:

- Baekheon
- Taegyeom

The Preview E2E regression therefore proves multi-Reader Source Truth reuse with those existing admitted mappings. It verifies that both Readers consume the same `officialReadingId`, `sourceResponseHash`, and `groundingHash`, while selecting different authorized source units.

## 4. Se-yeon / Yeo-ul boundary

Se-yeon and Yeo-ul have published Character Saju authoring, but this repository does **not** yet contain an approved explicit mapping from their authored `attentionAxes` to the shared Saju grounding-axis registry.

This runtime must not guess that mapping.

Before Se-yeon or Yeo-ul can enter this semantic Reader Interpretation path, a separate reviewed authority change must explicitly bind every published attention axis to a grounding axis and pin the interpretation behavior. Until then, their existing Reading Scene remains presentation-only and must not be treated as semantic Reader Interpretation authority.

## 5. Preview envelope

`ReaderInterpretationEnvelopeV1` contains:

- official Reading id
- Reader Character id
- active server-assembled Reader content bundle id
- requested Saju domain
- committed Official artifact response hash
- Saju semantic source-response hash
- grounding hash
- deterministic interpretation hash
- guarded Character utterance, or an explicit protected-fallback marker

It deliberately contains no raw official response copy.

## 6. Regression contract

Required Preview tests:

1. two admitted Readers share one official Source Truth;
2. Reader-specific selection differs without adding semantic text;
3. no active Reader access -> deny before raw artifact admission;
4. Reader A cannot borrow Reader B runtime context;
5. grounding/source hash provenance mismatch -> fail closed;
6. non-delivered Official Product Reading state -> fail closed;
7. Product Reading response-contract drift -> fail closed;
8. revoking Reader A leaves Reader B independently usable;
9. protected-only source material -> protected fallback;
10. same inputs -> identical envelope/hash;
11. the Saju projection boundary receives Official source provenance only, with no Reader/subject identity;
12. a projection result that fails positive grounding admission -> fail closed.

## 7. Saju-owned grounding projection boundary

PR #1142 makes the committed raw Official Reading artifact available behind a server-only authority boundary, and PR #1147 validates/projects the exact public ProductReadingResponse text into protected Character context.

Reader Interpretation now adds the semantic boundary without reimplementing Saju meaning:

1. resolve exact Reader access + Official raw artifact;
2. validate the ProductReadingResponse through the protected Official Reading projector;
3. send only Reader-independent Official source provenance to `OfficialReadingCharacterGroundingProjectionPortV1`;
4. positively admit the returned `CharacterGroundingBundleV1` against the active server-owned grounding ref;
5. verify Reading id, domain, response contract, engine, source-response hash, and grounding hash before Character selection/rendering.

The projection input intentionally contains no Reader id, Reader content bundle, or subject id. Character perspective is applied only after Saju-owned semantic grounding has been admitted.

MyeongHa does **not** construct grounding units from Product blocks and does not read Saju internal Claim Graph material. A narrow in-process adapter, `createSajuCharacterGroundingProjectionAdapterV1`, maps this port to Saju's source-owned `buildCharacterGroundingBundleV1` contract without reimplementing projection semantics. The runtime also provides `createSajuCharacterGroundingHttpAdapterV1` plus `createProductionSajuCharacterGroundingProjectionPortV1`, which bind the same authority to the configured Saju service origin and Bearer credential.

The matching authenticated Saju endpoint from `gycha0109-beep/Saju#1143` is now deployed at `POST /api/character-grounding`. Production Cloud Run run `35622856668` deployed Saju source `54667c70e46140b004d3b81c5797191538f6cbc3`, promoted revision `saju-production-00013-lar` to 100% traffic, and passed Production smoke. Hosted Reader Grounding Canary run `35624392882` then passed against that active deployment using MyeongHa harness authority `a2873e4546e5a7cea822ce9ccc2878f4de5e9711`. The cross-service Saju grounding transport dependency is therefore closed. Reader Interpretation remains Preview-only because public MyeongHa HTTP/Reader Scene activation is a separate authority boundary.

## 8. Activation boundary

This PR does **not**:

- grant ordinary runtime roles EXECUTE on the internal Reader Knowledge functions;
- activate paid Standard Reading;
- activate Production Saju interpretation;
- activate Product Offers, Charge Terms, PortOne, or payment;
- promote Preview output to Official Reading Source Truth;
- expose the raw Official Reading artifact in Character memory or the Reader envelope.

Server-owned Reader context composition is connected through the thread-bound Preview seam, and the source-side Saju grounding endpoint is now hosted-canary verified. The next integration slice is **MyeongHa Preview HTTP/Reader Scene wiring**. Browser input must never provide Character runtime context, Character perspective, semantic grounding, Reader access, or Official Reading prose. Public wiring must not synthesize missing Production content/context authority merely because the Saju transport is now available, and it must not promote Commerce authority implicitly.


## 9. Cross-service projection transport

The MyeongHa transport contract is intentionally narrow:

- endpoint: `POST /api/character-grounding`;
- authentication: existing Saju service Bearer;
- request: exact stored ProductReadingResponse snapshot + Saju engine version + Reading domain;
- omitted by design: subject id, Reader id, Reader bundle id, entitlement/grant ids, Character perspective, and DB artifact hash;
- response attestation: `x-myeonghwa-character-grounding-admitted: myeonghwa-character-grounding-v1`;
- MyeongHa then performs its own bundle identity and positive grounding admission before rendering.

The Saju semantic `sourceResponseHash` remains content-derived by Saju. The opaque DB `reading_refs.response_hash` remains separate storage provenance.


## 10. Thread-bound Reader Scene authority

The Preview runtime now has a server-only `runThreadBoundReaderInterpretationPreviewV1` seam for Reader Scene integration.

Authority order:

1. resolve the owner-authorized active Chat thread;
2. require exactly one active Character participant;
3. resolve the exact pinned immutable content release from the thread's active release id;
4. source the Reader Character and world relations only from that pinned release;
5. re-read current relationship state and active Memory grants from server authority;
6. reject caller-supplied Character, bundle, world, relationship, or Memory authority;
7. re-resolve exact Reader access + Official Reading artifact;
8. require Reader access `readerContentBundleId` to match the pinned Character bundle;
9. assemble the protected Official Reading context through the server-authorized seam;
10. derive the reviewed Character perspective from pinned published Character content;
11. request semantic grounding from Saju and positively admit it;
12. render/guard the Reader interpretation.

The thread-bound seam accepts no client-selected Reader id, Character perspective, semantic grounding bundle, grounding ref, or Official Reading prose. Se-yeon/Yeo-ul still fail closed because no reviewed grounding-axis perspective mapping exists for them.

This is still an internal Preview seam, not a public Production HTTP route.

The lower-level `runReaderInterpretationPreviewV1` primitive remains module-local for isolated semantic regression tests, but it is deliberately **not exported from the API package root**. Server integration must enter through the hardened thread-bound Preview seam so pinned content, relationship, Memory, Reader access, and Official Reading authority cannot be bypassed.


## 11. Preview HTTP seam

`READER_INTERPRETATION_PREVIEW_HTTP_PATH_V1` is fixed to:

`POST /api/me/readings/reader-interpretation/preview`

This is still a Preview composition seam, not a Production activation.

The request body is intentionally limited to:

- `threadId`
- `officialReadingId`

The following are rejected when supplied by the client:

- Reader Character id
- Reader content bundle id
- requested Saju domain
- Character runtime context
- grounding bundle / grounding ref
- Character perspective
- raw Official Reading response

The authenticated subject and effective time are server inputs. `ReaderInterpretationPreviewContextAuthorityPortV1` may provide only non-content server context; Character, content bundle, world relations, relationship state, and granted Memory context are explicitly excluded. The owner-authorized thread is independently re-read, its pinned release is resolved through the server `ContentReleaseRuntime`, relationship and Memory grants are re-read from their authorities, and exact Reader access is then revalidated. The Reading domain is derived from the authorized Official Reading source, not from client input.

The bounded HTTP response exposes only the Reader Scene material required by the Preview UI:

- lifecycle/mode
- Official Reading id
- server-derived Reader Character id
- server-derived Reading domain
- interpretation hash
- guarded utterance or protected fallback reason

It does not expose Reader content-bundle ids, DB artifact hashes, Saju source hashes, grounding hashes, raw ProductReadingResponse material, entitlement ids, or internal authority rows.

The existing browser `reading-character.js` is not switched to this endpoint in this slice because the current page flow does not yet carry the required server-authorized `threadId + officialReadingId` handoff. Falling back to URL-selected Reader identity would violate this authority model.


## 12. Hosted Production grounding evidence and remaining MyeongHa gates

Hosted grounding transport is closed with exact evidence:

- Saju Production deployment run: `35622856668`
- deployed Saju source: `54667c70e46140b004d3b81c5797191538f6cbc3`
- active Cloud Run revision: `saju-production-00013-lar`
- traffic: `100%`
- candidate + promoted Production smoke: `PASS`
- Hosted Reader Grounding Canary run: `35624392882`
- MyeongHa cross-service harness authority: `a2873e4546e5a7cea822ce9ccc2878f4de5e9711`
- hosted health, authenticated grounding, MyeongHa identity/hash admission, bounded Reader render, semantic preservation, wrong-Bearer denial, and revoked-Reader pre-transport denial: `PASS`

This evidence closes only the Saju cross-service transport prerequisite. It does not by itself authorize a public Reader Interpretation route.

Before `api/me.ts` / `vercel.json` may expose `POST /api/me/readings/reader-interpretation/preview`, Production MyeongHa composition must bind all of the existing HTTP seam dependencies to concrete server authorities. In particular:

1. the exact pinned immutable `ContentReleaseRuntime` entry must be recoverable from server-owned published content authority rather than browser Reader keys or development fixtures;
2. `ReaderInterpretationPreviewContextAuthorityPortV1` must be backed by concrete server context authority for its non-content fields rather than invented empty/default context;
3. current relationship, Memory, thread binding, Reader access, and Official artifact reads must execute inside the canonical subject-scoped PostgreSQL transaction;
4. the already-hosted `createProductionSajuCharacterGroundingProjectionPortV1` is the only Production grounding transport;
5. Reader Scene handoff must carry only `threadId + officialReadingId`; URL-selected Reader identity remains presentation input and must not become runtime authority.

Until those MyeongHa composition gates are concrete and tested, the public rewrite and browser endpoint switch remain fail-closed.
