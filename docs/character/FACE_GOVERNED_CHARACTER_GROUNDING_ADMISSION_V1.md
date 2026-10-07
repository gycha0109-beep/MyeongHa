# Governed Face CharacterGrounding admission v1

> Watchtower-Track: `topic-face`  
> Issue: #1705

## Authority split

Traditional Face meaning remains source-owned by Saju.

MyeongHa may:

- verify the source handoff;
- verify the source-owned governed CharacterGrounding bundle/ref;
- enforce Character capability;
- select at most the authored Character limit while preserving upstream order;
- render and persist/reveal the already-authorized meaning.

MyeongHa must not create or repair:

- `lensKey`;
- `direction`;
- evidence status;
- conditions or qualifiers;
- protected meaning;
- methodology/binding provenance;
- grounding hashes;
- source conflicts.

## Runtime separation

Neutral Face and governed traditional Face use separate runtime contexts.

```text
neutral observation
→ context.face
→ CharacterFaceCapabilityProfileV1

governed traditional interpretation
→ context.governedFace
→ CharacterFaceGovernedCapabilityProfileV1
```

A governed reading plan no longer accepts the neutral `context.face` path.

## Source admission

An eligible Saju response must contain:

```text
sourceBinding
handoff
grounding
groundingRef
```

MyeongHa re-admits all three source artifacts and requires exact identity binding across:

- topicKey;
- sourceContractVersion;
- sourceAuthorityRef;
- sourceResultHash;
- authorizationReceiptRef;
- handoffHash;
- grounding bundleHash/ref.

Unexpected or biometric/private fields fail closed.

## Character capability

Seyeon's named Face profile has a separate governed capability:

```text
capabilityVersion = seyeon-face-governed-capability-v1
allowedTopicKeys = [face.reading.three_divisions]
canInitiate = false
```

This does not authorize the source topic by itself.

The source must first return a valid `product_authorized / character_public_reading` governed handoff and grounding.

The governed reading plan then requires all of:

```text
admitted governedFace runtime
+ matching Character/content identity
+ matching governed topic capability
+ face_product voice authority
+ exact handoff/source/grounding identity
```

Only after those checks may Seyeon's existing perspective select up to 3 units in upstream order.

## Production state

Current real Three-Divisions source authority remains blocked upstream.

Therefore production still resolves:

```text
Saju → not_eligible/source_blocked
```

and never reaches Character capability or plan creation.

Synthetic eligible material is TEST ONLY and exists solely to prove the closed contract chain.

## Acceptance

1. MyeongHa never synthesizes governed grounding.
2. Handoff/grounding/ref tampering is rejected.
3. Neutral Face context cannot create a governed reading plan.
4. Missing or mismatched governed Character capability blocks the plan.
5. Seyeon governed capability allows only the authored traditional topic.
6. Selection remains upstream-order, max 3.
7. Existing governed artifact → commit/reveal flow consumes the admitted governed context.
8. Real blocked source remains blocked.
