# FR-53 authority decision

## Decision

FR-53 does **not** admit a reproducible soft-tissue mental tubercle acquisition rule.

It records a narrower result:

- facial-surface `soft-tissue Mt` usage is corroborated across two reviewed 3D studies;
- Mt is used as a chin-region landmark;
- Langstaff 2016 supplies adjacent mental-tubercle-labelled facial-surface catalogue evidence only, not direct soft-tissue Mt construct equivalence;
- no reviewed source provides a sufficiently explicit, independently reproducible facial-surface definition;
- no reviewed source establishes Mt membership on FR-51 `central_inferior_soft_tissue_chin_boundary`;
- no reviewed source establishes `soft-tissue Mt == Menton-side`;
- no reviewed source establishes `soft-tissue Mt == mental-tubercle-anterior`.

## FR-52 correction

FR-52 is revised from authority version `0.1.0` to `0.1.1` because its code previously marked soft-tissue Mt as FR-51 scope-compatible while its prose explicitly said that inferior-boundary membership had not been proven.

The corrected state is:

```text
chinRegionAssociation = true
centralInferiorScopeCompatibility = false
scopeCompatibleWithFR51 = false
researchAcquisitionExecutable = false
```

Menton-side remains the only currently executable endpoint **research candidate**, not a final endpoint.

## Why Langstaff does not close the definition gap

Langstaff 2016 places bilateral `protrusion of mental tubercle` landmarks on facial scan surfaces, but FR-53 does not assume this label is construct-equivalent to Zhang/Lü `soft-tissue Mt`.

The catalogue description is not sufficiently operational to locate the point independently, and no cross-source mapping is supplied.

Therefore:

```text
adjacent mental-tubercle surface catalogue == soft-tissue Mt
```

remains unauthorized.

## Why the nearby mental-tubercle-anterior definition is insufficient

The FSTT/anatomical lineage provides the reproducible description:

`most prominent point on the lateral bulge of the chin mound`

That is useful evidence about a nearby construct but not an equivalence proof for facial-surface soft-tissue Mt.

Therefore:

```text
mental_tubercle_anterior == soft_tissue_Mt
```

remains unauthorized.

## Still blocked

- soft-tissue Mt surface acquisition rule;
- Mt paired annotations;
- Mt vs Menton-side endpoint comparison;
- Mt membership on the FR-51 inferior boundary;
- final FR-35 endpoint pair;
- provider / MediaPipe mapping;
- traditional 地閣 equivalence;
- production 三停 / F1 / F6 / geometry.

## Next evidence

The next search should target **primary anthropometric definitions or direct construct-mapping evidence**, not additional papers that merely name or manipulate Mt.
