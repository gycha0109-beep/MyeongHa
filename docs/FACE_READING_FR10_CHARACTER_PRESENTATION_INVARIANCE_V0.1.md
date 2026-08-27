# MyeongHa Face Reading FR-10 — Character Presentation Invariance v0.1

## 1. Status

Implementation candidate for the research-only Face Reading vertical.

FR-10 does **not** grant characters Face semantic authority.

It proves a narrower product contract:

```text
same protected Face diagnosis
→ different character presentation order / focus
→ identical semantic authority
```

## 2. Authority boundary

The current chain is:

```text
Face research criterion assertions
→ FR-9 research diagnosis
→ FaceResearchCharacterGrounding
→ FR-10 character presentation adapter
```

The Character layer may change:

- ordering of already-approved narrative blocks,
- which approved block is emphasized first,
- non-semantic follow-up strategy key,
- presentation mode.

The Character layer may not change:

- Face claim set,
- semantic keys,
- FaceVerdict semantics,
- Hidden Tension semantics,
- source/evidence provenance,
- research-only authority state,
- prohibited inference set,
- approved narrative block text.

## 3. Why this lives in `packages/domain`

`packages/face-reading` owns Face semantic and narrative authority.

`packages/character-content` owns versioned character presentation configuration.

`packages/domain` owns the runtime adapter that applies one character presentation profile to one already-issued Face diagnosis.

This mirrors the existing Saju/Character split: character behavior is downstream of protected semantic authority.

## 4. Content-pinned profile

The presentation profile is a versioned Character Content artifact:

```ts
interface CharacterFacePresentationProfileV1 {
  schemaVersion: 'v1';
  profileVersion: string;
  characterId: string;
  characterContentVersion: string;
  mode:
    | 'strongest_first'
    | 'contrast_first'
    | 'detail_first';
}
```

The mode is not inferred from free-form persona prose.

That avoids hidden heuristics such as:

```text
"direct personality" → strongest_first
"sensitive personality" → contrast_first
```

Such inference would make character behavior unstable across prompt/model versions.

## 5. Three presentation modes

### 5.1 `strongest_first`

Order:

```text
session framing
→ protected verdict
→ protected Top features
→ protected tension, if present
```

Runtime hints:

```text
focus = dominant_feature
followUpStrategy = inspect_dominant_feature
```

### 5.2 `contrast_first`

When a protected tension block exists:

```text
session framing
→ protected tension
→ protected verdict
→ protected Top features
```

Runtime hints:

```text
focus = contrast_axis
followUpStrategy = explore_contrast_axis
```

When no tension block exists, FR-10 does not fabricate one.

It deterministically falls back to:

```text
effectiveMode = strongest_first
fallbackReason = no_tension_block
```

### 5.3 `detail_first`

Order:

```text
session framing
→ protected Top features
→ protected verdict
→ protected tension, if present
```

Runtime hints:

```text
focus = local_detail
followUpStrategy = inspect_local_detail
```

## 6. No character-authored Face prose

FR-10 accepts only narrative blocks already present in `FaceResearchCharacterGrounding.approvedNarrativeBlocks`.

For every output block:

```text
output block key
must exist in approved narrative blocks

AND

output block text
must be byte-for-byte identical to approved text
```

The adapter also requires every approved block exactly once.

Therefore a character cannot:

- add a new fortune statement,
- soften or strengthen an existing diagnosis,
- rewrite a protected claim,
- omit an inconvenient contradiction,
- invent a new tension,
- insert an LLM-authored Face interpretation.

## 7. Research-only state preservation

The adapter calls the FR-9 issued-object projection path.

A structurally identical copied diagnosis object is rejected before presentation.

The resulting presentation retains the complete protected grounding containing:

```text
authorityState = research_only
assertionAuthority
evidenceRefs
semanticSignature
semanticClaims
unavailableSections
prohibitedInferences
approvedNarrativeBlocks
```

No downstream character mode can erase the research status.

## 8. Protected diagnosis digest

FR-10 calculates:

```text
sha256:v1:<digest>
```

over a canonicalized protected grounding payload.

Included in the digest:

- research authority state,
- assertion authority,
- evidence refs,
- semantic signature,
- grounding/engine/methodology versions,
- semantic claim refs and semantic values,
- approved narrative block keys and exact text,
- unavailable sections,
- prohibited inferences.

Excluded from the digest:

- character ID,
- character content version,
- character presentation profile version,
- requested presentation mode,
- ordering of presentation blocks,
- presentation focus/follow-up hints.

Therefore three characters can have visibly different presentations while producing the same protected diagnosis digest.

## 9. Invariance tests

FR-10 tests require:

```text
strongest_first
contrast_first
detail_first
```

for the same FR-9 diagnosis to have:

- identical protected diagnosis digest,
- identical protected semantic signature,
- identical semantic claim refs,
- identical approved narrative key/text mapping,
- identical research/evidence provenance,
- different diagnostic block order where applicable.

Additional negative tests cover:

- unsupported presentation mode,
- forged FR-9 diagnosis object,
- contrast-first without a tension block,
- accidental character-authored prose insertion by construction.

## 10. Product interpretation

This gives characters a real presentation difference without turning them into separate physiognomy engines.

For the same diagnosis:

```text
Character A
"strongest first"
→ leads with the dominant verdict

Character B
"contrast first"
→ leads with the strongest internal contrast

Character C
"detail first"
→ starts from concrete local features
```

The user may experience three different conversational personalities, but the underlying Face diagnosis remains one governed result.

## 11. Intentionally not included

FR-10 does not yet implement:

- character-specific free-form Face commentary,
- character-specific semantic interpretation,
- LLM-generated follow-up questions,
- relationship-state-dependent Face semantic changes,
- production image classification,
- production physiognomy thresholds,
- Twelve Palaces/domain fortune synthesis.

Follow-up questions may later be authored as safe, non-semantic Character Content catalogs. They must not introduce new Face claims.

## 12. Next candidate

FR-11 should connect these presentation profiles to authored character content/runtime selection and add safe follow-up catalogs.

A valid FR-11 result should demonstrate:

```text
same Face diagnosis
+ same character content version
+ same relationship state
→ deterministic character presentation

relationship/persona differences
→ different question/framing behavior

Face semantic payload
→ unchanged
```
