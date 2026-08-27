# MyeongHa Face Reading FR-11 — Character Runtime Follow-ups v0.1

## 1. Goal

FR-11 connects the FR-10 presentation adapter to the active Character Runtime projection.

The invariant remains:

```text
Character state may change presentation behavior.
Character state may not change Face semantic authority.
```

The new path is:

```text
FR-9 protected research diagnosis
→ FR-10 content-pinned character presentation
→ FR-11 Character Runtime trust-band projection
→ content-pinned follow-up question
```

## 2. Inputs read from Character Runtime

FR-11 reads only the Character Runtime fields needed for presentation behavior:

```text
characterId
contentVersion
relationshipRevision
relationshipPolicyVersion
relationship.trustBand
relationship.behaviorVersion
```

These values do not enter the protected Face diagnosis digest.

They are presentation context only.

## 3. Follow-up strategy authority

The follow-up strategy taxonomy is owned by Character Content:

```text
inspect_dominant_feature
explore_contrast_axis
inspect_local_detail
```

FR-10 chooses one strategy deterministically from the effective presentation mode.

FR-11 does not reinterpret that strategy.

## 4. Safe follow-up catalog

Each character receives a versioned catalog:

```ts
interface CharacterFaceSafeFollowUpCatalogV1 {
  schemaVersion: 'v1';
  catalogVersion: string;
  characterId: string;
  characterContentVersion: string;
  byStrategy: {
    inspect_dominant_feature: { low: string; medium: string; high: string };
    explore_contrast_axis: { low: string; medium: string; high: string };
    inspect_local_detail: { low: string; medium: string; high: string };
  };
}
```

The catalog must match the active Character Runtime `characterId` and `contentVersion`.

## 5. Relationship state usage

The relationship engine may select a different wrapper question according to `trustBand`.

Example shape:

```text
low trust
→ "가장 선명한 부분부터 조금 더 볼까요?"

medium trust
→ "가장 강하게 잡힌 부분부터 더 들어가 볼까요?"

high trust
→ "제일 강한 부분, 더 깊게 뜯어볼까요?"
```

The protected Face reading is identical in all three cases.

Relationship state changes only conversational distance/tone.

It must not cause transformations such as:

```text
high trust
→ stronger fortune claim       ❌

high closeness
→ reveal a new Face claim      ❌

high friction
→ weaken the diagnosis         ❌
```

## 6. Catalog validation

The machine validator enforces structural constraints:

- exact strategy set,
- exact low/medium/high band set,
- non-empty character/content/catalog versions,
- maximum 240 characters per question,
- one-line text,
- no `{...}` interpolation tokens,
- question-form ending (`?` or `？`),
- character identity/content-version match.

These checks do **not** prove semantic neutrality of arbitrary human prose.

The catalog remains authored/reviewed Character Content. Human content review is required before production use.

The runtime never accepts provider-authored Face follow-up prose in this path.

## 7. Runtime output

FR-11 returns:

```text
CharacterFaceRuntimeTurnV1
├─ active character identity/version
├─ relationship revision/policy/behavior versions
├─ FR-10 presentation
│  ├─ protected Face grounding
│  ├─ protected diagnosis digest
│  └─ ordered approved Face narrative blocks
└─ selected safe follow-up
   ├─ strategy
   ├─ trust band
   ├─ catalog version
   ├─ stable key
   └─ fixed question text
```

The follow-up is outside `approvedNarrativeBlocks`.

Therefore it is explicitly a Character wrapper question, not part of Face semantic/narrative authority.

## 8. Invariance requirements

For one protected Face diagnosis:

### Trust-band variation

```text
trustBand low
trustBand medium
trustBand high
```

may change:

- follow-up question text,
- follow-up key.

They must not change:

- protected diagnosis digest,
- semantic signature,
- semantic claim set,
- approved Face narrative blocks,
- research authority state,
- evidence refs,
- prohibited inference set.

### Relationship revision variation

A later relationship revision may change wrapper behavior but must not alter the protected Face payload.

## 9. Character differentiation

Combined with FR-10, the same Face diagnosis can now feel different across characters:

```text
Character A
strongest_first
→ verdict first
→ dominant-feature follow-up

Character B
contrast_first
→ tension first
→ contrast-axis follow-up

Character C
detail_first
→ local details first
→ local-detail follow-up
```

Trust band then changes how close/direct each character's fixed follow-up question is.

This creates real character differentiation without separate physiognomy semantics.

## 10. Failure behavior

FR-11 fails closed when:

- FR-9 diagnosis is structurally forged,
- presentation profile belongs to another character,
- presentation profile content version mismatches active runtime,
- follow-up catalog belongs to another character,
- follow-up catalog content version mismatches active runtime,
- trust band is unsupported,
- relationship revision is invalid,
- required runtime version refs are empty,
- follow-up catalog structure is malformed.

## 11. Still blocked

FR-11 does not enable:

- LLM-authored Face follow-up questions,
- Character-created Face semantic claims,
- relationship-driven Face semantic mutation,
- production image-to-criterion classification,
- production physiognomy thresholds,
- dynamic 氣色,
- full Twelve Palaces/domain fortune synthesis.

## 12. Next candidate

The next character-side candidate is a **full authored Face Character Profile bundle** that packages:

```text
presentation profile
+ safe follow-up catalog
+ emotion/cue mapping
```

against one active Character Content version.

The next Face-engine-side candidate remains source/observation expansion rather than giving characters more semantic authority.
