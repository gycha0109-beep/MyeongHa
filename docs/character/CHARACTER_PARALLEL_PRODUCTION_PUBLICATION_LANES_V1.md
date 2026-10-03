# Character Parallel Production Publication Lanes v1

Status: architecture contract for independent Character publication readiness.

## 1. Purpose

Character authoring is parallel by design.

```text
Bible Standard
├─ Seyeon Bible
├─ Yeoul Bible
├─ Seorin Bible
├─ Rahyeon Bible
├─ Mira Bible
├─ Taegyeom Bible
├─ Yunho Bible
├─ Doyun Bible
└─ Baekheon Bible

Runtime Standard
├─ Seyeon Runtime
├─ Yeoul Runtime
├─ ...
└─ Baekheon Runtime
```

Production publication must preserve the same shape. One incomplete Character must not force an already source-complete Character to fabricate missing authority, and one complete Character must not falsely declare the whole nine-Character launch ready.

## 2. Two distinct gates

### Per-Character publication lane

A lane contains exactly one approved canonical Character.

It may become ready independently when all source-backed requirements for that Character are present.

```text
Character-specific Bible/canon
+ Character-specific Runtime
+ concrete assetRefs
+ concrete emotionIds
+ concrete animationCueIds
+ versioned asset-manifest provenance
+ immutable bundle metadata
→ one-Character Production publication lane
```

### Exact-nine aggregate Launch gate

The existing exact-nine Production Launch validator remains unchanged.

```text
all nine approved Characters
→ exact-nine aggregate launch readiness
```

Per-Character readiness never implies aggregate launch readiness.

## 3. Operational release shape

SRC-27 already permits multiple active releases.

A lane release is activated as **active non-default**.

The global default release is not replaced merely because one Character lane becomes ready.

```text
existing global active default release
+
Seyeon active non-default release
+
future Yeoul active non-default release
+
...
```

A domain adapter may bind a Character lane only when its own domain authority also permits that binding.

## 4. Face boundary

A Character lane establishes Character identity and delivery authority only.

It does not grant Face semantic authority.

```text
Face semantic source
→ Face grounding/admission
→ Character Face binding to an active Character lane
→ bounded Character selection/delivery
```

The Character layer may not invent morphology, personality, fate, wealth, relationship claims, confidence, thresholds, or missing Face facts.

## 5. Fail-closed rules

A lane is blocked when any of the following is absent or mismatched:

- canonical approved characterId;
- approved immutable display identity;
- complete source-backed Character content;
- authored gender/visual canon;
- concrete asset refs;
- concrete emotion IDs;
- concrete animation cue IDs;
- versioned asset-manifest provenance;
- lane bundle metadata;
- exact contentVersion consistency.

No sibling Character may fill another Character's missing fields.

## 6. First lane

The first production lane is `seyeon`.

Seyeon-specific values must be resolved from the reviewed/approved Seyeon Bible and Runtime sources. This architecture document does not duplicate or invent those values.

Refs #1565, #1371.

Watchtower-Track: topic-face
