# TOPIC-FACE-005B — Production Face Grounding Admission into MyeongHa

Status: implementation contract  
Watchtower-Track: topic-face  
Tracking: #1333

## 1. Goal

TOPIC-FACE-005B establishes the MyeongHa-side admission boundary for the source-owned production-neutral Face Character grounding identity produced by the Saju/topic-face repository.

The boundary is:

```text
Saju/topic-face
  FaceCharacterGroundingBundleV1
  -> FaceCharacterGroundingBundleRefV1
          |
          v
MyeongHa
  active server-owned Face source binding
          +
  candidate grounding ref
          |
          v
  exact identity admission
          |
          v
  CharacterFaceRuntimeContextV1
```

005B does not make Character a Face semantic authority.

## 2. Source ownership

The Saju/topic-face repository remains authoritative for:

- Face execution/readiness;
- neutral observation admission;
- Product projection;
- Face grounding;
- admitted display facts;
- prohibited inference preservation;
- Character-safe grounding projection;
- source-owned Character grounding hash/reference.

MyeongHa owns only the consumer-side admission and Character runtime context attachment in this slice.

## 3. Exact source wire contract

MyeongHa consumes the source ref exactly as issued:

```ts
interface CharacterFaceGroundingRefV1 {
  schemaVersion: 'face-character-grounding-ref-v1';
  topicKey: string;
  sourceResultHash: string;
  projectionHash: string;
  groundingHash: string;
  displayFactsHash: string;
  bundleHash: string;
  projectionVersion: 'face-character-grounding-projection-v1';
}
```

MyeongHa does not rename or reinterpret the source fields.

Protected hash formats remain:

```text
sourceResultHash = face-topic-source-result:<64 lowercase hex>
projectionHash   = face-product-projection:<64 lowercase hex>
groundingHash    = face-grounding:<64 lowercase hex>
displayFactsHash = face-display-facts:<64 lowercase hex>
bundleHash       = face-character-grounding:<64 lowercase hex>
```

## 4. Wire-shape validation is not source admission

A caller can fabricate an object whose keys and hash syntax are structurally valid.

Therefore:

```text
valid wire shape
!=
admitted source grounding
```

005B requires a server-owned active source binding.

```ts
interface CharacterFaceSourceBindingV1 {
  schemaVersion: 'character-face-source-binding-v1';
  topicKey: string;
  readinessState: 'available' | 'partial';
  mode: 'neutral_fact_realization';
  sourceResultHash: string;
  projectionHash: string;
  groundingHash: string;
  displayFactsHash: string;
  bundleHash: string;
  projectionVersion: 'face-character-grounding-projection-v1';
  unavailableSections: readonly string[];
}
```

The candidate ref is admitted only when every semantic identity field matches this active binding.

## 5. Source binding is server authority

`CharacterFaceSourceBindingV1` is not a browser-authored DTO.

The future source adapter is responsible for obtaining this binding from an authenticated, source-authoritative server path.

A client must not choose:

- readiness;
- realization mode;
- topic authority;
- sourceResultHash;
- projectionHash;
- groundingHash;
- displayFactsHash;
- bundleHash;
- unavailable sections.

005B defines the admission seam but does not create the cross-service HTTP transport.

## 6. Character runtime attachment

The admitted Character runtime projection is deliberately reference-only:

```ts
interface CharacterFaceRuntimeContextV1 {
  schemaVersion: 'character-face-context-v1';
  topicKey: string;
  readinessState: 'available' | 'partial';
  mode: 'neutral_fact_realization';
  unavailableSections: readonly string[];
  groundingRef: CharacterFaceGroundingRefV1;
}
```

The existing `CharacterRuntimeContextV1` remains unchanged.

005B extends it through:

```ts
interface CharacterRuntimeContextWithFaceGroundingV1
  extends CharacterRuntimeContextV1 {
  face: CharacterFaceRuntimeContextV1 | null;
}
```

This preserves compatibility with existing Chat/Saju runtime code.

## 7. No full semantic bundle in 005B

005B does not attach:

- Face grounding units;
- display values;
- qualifiers;
- prohibited extension internals;
- semantic claims;
- approved narrative blocks;
- Face Engine private payloads.

The Character runtime learns only that a particular source-owned grounding identity is admitted.

Actual unit retrieval/selection is a later boundary.

## 8. READY / PARTIAL / BLOCKED behavior

Allowed:

```text
available -> admit
partial   -> admit + preserve unavailableSections
```

Not allowed:

```text
blocked
failed
pending
other unfinalized state
```

A blocked Face source does not become Character input.

In particular, a blocked traditional Face topic cannot be restored through Character.

## 9. Partial preservation

For a partial topic such as the current extended neutral Face discovery, unavailable capability metadata remains explicit.

Example:

```text
readinessState = partial
unavailableSections =
  observation:forehead.visible_width_shape
```

Character-side admission must not infer or synthesize the missing forehead value.

## 10. No Character identity in source grounding

The source grounding ref contains no:

- characterId;
- personaVersion;
- relationshipState;
- relationship revision;
- session/conversation ID.

Different Characters consuming the same admitted Face source must begin from the same grounding ref.

Likewise relationship changes may affect downstream delivery later but cannot alter Face source truth.

## 11. Research-only Face isolation

MyeongHa already has an older FR-9/10/11 research-only Character Face path.

That path uses:

```text
ResearchCharacterFaceGroundingV1
authorityState = research_only
assertionAuthority = research_fixture | human_label_assertion
semanticClaims
approvedNarrativeBlocks
```

005B does not promote or reuse that contract for production-neutral Face discovery.

The two authority paths remain separate:

```text
research-only Face grounding
  -> research presentation/runtime

production-neutral Face grounding ref
  -> 005B admission
  -> future production Character Face slices
```

A research grounding object is rejected by the production-neutral ref admission boundary.

A production-neutral ref is rejected by the research-only presentation boundary.

## 12. Forbidden widening

Exact-key admission rejects material such as:

- grounding units;
- semanticClaims;
- personality/fate assertions;
- raw image;
- raw landmarks;
- face embedding;
- Character metadata;
- relationship metadata;
- persona metadata;
- price/offer/entitlement;
- requestId.

005B cannot create new Face meaning.

## 13. No legacy Face engine coupling

MyeongHa Character/Domain runtime must continue to avoid direct dependency on the legacy local Face engine package.

005B consumes only the protected source-owned wire identity.

It must not import `packages/face-reading` to recalculate or reconstruct Face semantics.

## 14. Persistence and history

005B does not create a database table or history sidecar.

The source Product result identity and Character grounding identity currently have separate lifecycles.

A later authenticated transport/persistence slice may pin their association, but it must not claim a cryptographic `resultRef -> groundingRef` binding before the source contract actually provides one.

## 15. Acceptance

The slice is complete when tests prove:

- exact structure grounding ref admits;
- partial extended grounding admits and preserves unavailable sections;
- missing source + supplied ref rejects;
- active source + missing ref rejects;
- blocked/failed/unfinalized source rejects;
- schema/projection drift rejects;
- every protected hash mismatch rejects;
- malformed/wrong-prefix hashes reject;
- unexpected semantic/privacy/Character/Commerce/request fields reject;
- Character and relationship changes do not change source grounding identity;
- research-only grounding cannot enter production-neutral admission;
- production-neutral grounding ref cannot enter research-only renderer;
- existing CharacterRuntimeContextV1 remains unchanged;
- existing Saju grounding and FR10/FR11 regression suites remain green.

## 16. Next boundary

TOPIC-FACE-005C may consume:

```text
admitted Character Face context
+
source-approved full Face grounding bundle retrieval
    ->
bundle/ref correlation
    ->
Character Face capability
    ->
Perspective
    ->
deterministic insight selection
```

Named Character behavior, including character-specific attention/order, belongs there or later.

005B itself contains no persona-specific Face semantics.
