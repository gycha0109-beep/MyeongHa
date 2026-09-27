# TOPIC-FACE-005C-A — Full Production Face Grounding Bundle Admission

Status: implementation contract  
Tracking: #1335  
Watchtower-Track: topic-face

## 1. Goal

TOPIC-FACE-005C-A lets MyeongHa consume the full source-owned production-neutral Face Character grounding bundle only after TOPIC-FACE-005B admitted its stable grounding identity.

The boundary is:

```text
Saju/topic-face source
  FaceCharacterGroundingBundleV1
          |
          v
MyeongHa
  admitted CharacterFaceRuntimeContextV1
  + full bundle candidate
          |
          v
  schema / source hash compatibility
  + ref correlation
  + context correlation
          |
          v
  CharacterFaceGroundingBundleViewV1
```

005C-A does not perform Character capability selection, Perspective, insight selection, reading planning, rendering, or conversation.

## 2. Source ownership

The Saju/topic-face repository remains authoritative for:

- source result identity;
- Product projection identity;
- Face grounding identity;
- admitted display-fact identity;
- production-neutral observation units;
- realization policy;
- unavailable sections;
- prohibited inferences;
- Character grounding bundle hash.

MyeongHa may validate and consume this contract. It may not reinterpret or widen it.

## 3. Full bundle contract

MyeongHa mirrors the source wire contract:

```ts
interface CharacterFaceGroundingBundleViewV1 {
  schemaVersion: 'face-character-grounding-v1';
  projectionVersion: 'face-character-grounding-projection-v1';
  realizationPolicyRegistryVersion: 'face-character-realization-policy-v1';
  topicKey: string;
  readinessState: 'available' | 'partial';
  faceEngineVersion: string;
  sourceResultHash: string;
  projectionHash: string;
  groundingHash: string;
  displayFactsHash: string;
  units: readonly CharacterFaceObservationUnitViewV1[];
  unavailableSections: readonly string[];
  prohibitedInferences: readonly string[];
  bundleHash: string;
}
```

Only `neutral_observation` units and `bounded_neutral_fact_render_v1` are admitted in the current production slice.

## 4. Display values are facts, not Character semantics

A unit may carry a scalar or source-defined continuous/composite axes.

MyeongHa preserves the supplied numeric value/unit and source metric identity.

005C-A does not authorize:

- large/small classification;
- personality inference;
- fortune/fate inference;
- wealth inference;
- relationship inference;
- threshold invention;
- certainty strengthening;
- traditional Face promotion.

A value such as `0.42 ratio` remains a source-neutral measured value.

## 5. Source hash compatibility

Saju/topic-face computes `bundleHash` with recursive object-key sorting, source array order, explicit normalization for undefined/non-finite values, JSON serialization, and SHA-256.

MyeongHa duplicates this exact canonicalization algorithm only for cross-repository verification.

```text
bundleHash =
face-character-grounding:
  sha256(source-compatible canonical bundle material without bundleHash)
```

A fixed golden vector is pinned in tests so a MyeongHa-only hash regression cannot silently redefine source identity.

## 6. Ref correlation

The full bundle must exactly match the grounding ref already admitted by TOPIC-FACE-005B.

The following fields are correlated:

- topicKey;
- sourceResultHash;
- projectionHash;
- groundingHash;
- displayFactsHash;
- bundleHash;
- projectionVersion.

A valid bundle for another Face result is rejected.

## 7. Context correlation

The bundle must also match the admitted Face runtime context:

- topicKey;
- readinessState;
- unavailableSections.

Therefore a partial source cannot be rewritten as available, and unavailable capabilities cannot disappear during Character ingestion.

## 8. Deterministic source ordering

The source build path deterministically orders:

- units by unitId;
- display axes by axisKey;
- qualifiers;
- prohibited extensions;
- unavailable sections;
- prohibited inferences.

The consumer rejects order drift rather than silently canonicalizing a caller-authored mutation.

## 9. Prohibition preservation

Every admitted unit must preserve all bundle-level prohibited inferences and the current neutral-to-traditional promotion prohibition:

```text
traditional_semantic_promotion_without_governed_claim
```

Dropping a prohibition fails closed.

## 10. Provider seam

005C-A exposes only a provider interface:

```ts
interface CharacterFaceGroundingBundleProviderV1 {
  load(ref: CharacterFaceGroundingRefV1): Promise<unknown>;
}
```

It intentionally does not implement HTTP transport.

The future adapter must be authenticated/server-owned. A browser, Character, or LLM must not author the source bundle.

## 11. Research isolation

Existing FR-9/10/11 research-only Face grounding remains separate.

```text
ResearchCharacterFaceGroundingV1
  -> research-only renderer

FaceCharacterGroundingBundleV1
  -> production-neutral admission
```

Research semantic claims or approved research narrative blocks cannot enter this contract.

## 12. Privacy and authority boundary

Exact-key admission rejects extra semantic, biometric, Character, request, and Commerce payloads such as:

- semanticClaims;
- personality;
- rawImage/rawLandmarks;
- faceEmbedding;
- characterId;
- relationshipState;
- requestId;
- price;
- entitlement.

005C-A accepts only the source-defined bundle surface.

## 13. Persistence

No DB or history persistence is added in this slice.

The full bundle is an admitted runtime view associated with the already-admitted source ref. Persistent cross-service transport/sidecar ownership remains a later integration concern.

## 14. Completion criteria

005C-A is complete when tests prove:

- source canonical hash golden-vector parity;
- four-unit structure bundle admission;
- partial extended admission with unavailable forehead preserved;
- exact ref/bundle correlation;
- exact context readiness/unavailable correlation;
- source display values preserved unchanged;
- duplicate identities/order drift rejected;
- unsupported display kinds/non-finite values rejected;
- realization-policy widening rejected;
- prohibited-inference removal rejected;
- semantic/privacy/Character/Commerce/request widening rejected;
- research-only grounding rejected;
- existing TOPIC-FACE-005B and Character/Saju regressions remain green.

## 15. Next slice

TOPIC-FACE-005C-B owns:

```text
admitted Face context
+
admitted full Face grounding bundle
    ->
Character Face capability
    ->
Character Face Perspective
```

It still will not select units or render prose.

Deterministic unit selection remains TOPIC-FACE-005D.
