# MyeongHa Face Reading FR-22 — MyeongHa-Owned Face Observation Provider Contract v0.1

Status: consumer-contract authority / no verified provider implementation
Scope: neutral Face Observation provider conformance boundary
Baseline: FR-14 neutral bindings, FR-15 neutral observation schema, FR-16 adapter evidence, FR-17 derivation registry, FR-18 artifact identity, FR-19 capture orientation, FR-20 laterality policy

## 1. Decision

MyeongHa owns the contract for what may enter the Face Reading engine as neutral observation data.

This does **not** make a third-party provider, MediaPipe, FaceLab, or an LLM the authority for traditional Face Reading meaning.

The authority split remains:

```text
provider implementation
→ neutral observation only

MyeongHa methodology / operationalization / rules
→ traditional semantic authority
```

FR-22 exists so provider activation does not depend on importing a provider's evaluation schema or treating upstream source code as semantic authority.

## 2. Current state remains closed

FR-22 v0.1 deliberately records:

```text
authorityState = consumer_contract_only
implementationRegistryState = no_verified_implementation
verifiedImplementationRefs = []
providerActivationAllowed = false
```

The contract is ready to define conformance. No current implementation is certified by it.

## 3. Contract pins

FR-22 pins the MyeongHa-owned neutral observation chain:

```text
FR-14 neutral consumer/binding contract
FR-15 myeongha-neutral-observation-v1
FR-17 neutral derivation registry
FR-19 canonical image orientation authority
FR-20 laterality consumption policy
```

It requires all six neutral slots:

```text
neutral.face.brow_midline       → point
neutral.face.nose_region        → region
neutral.face.left_brow_region   → curve
neutral.face.right_brow_region  → curve
neutral.face.left_eye_region    → region
neutral.face.right_eye_region   → region
```

Required provider capabilities remain the FR-14/15 set:

```text
neutral_pose_quality
neutral_brow_regions
neutral_brow_midline_derivation
neutral_eye_regions
neutral_nose_region
```

## 4. Provider implementation attestation

A provider implementation candidate must identify:

```text
implementation ref
provider-side neutral contract version
adapter repository / commit / source path / blob SHA
runtime artifact identity evidence
runtime artifact digest for verified activation
supported neutral capabilities
per-slot source mode
conformance evidence
```

A provider dependency or package lock alone is not implementation conformance.

FR-18's consumer lockfile artifact identity is useful supply-chain evidence, but FR-22 separately requires the implementation that actually emits MyeongHa neutral observations to be pinned and tested.

## 5. Per-slot source authority

Each slot must declare one of:

```text
direct_provider_topology
reviewed_neutral_derivation
unimplemented
```

### direct_provider_topology

This is accepted only where FR-16 already classifies the exact provider topology as a bounded research candidate.

At present that means the two closed-cycle eye connection sets can be represented as candidates, but remain research-only and therefore still block activation.

It does **not** authorize:

- provider index subsets invented by the adapter,
- FACE_LANDMARKS_NOSE as a nose polygon,
- disconnected brow chains collapsed into a single curve,
- provider LEFT/RIGHT as anatomical side.

### reviewed_neutral_derivation

The source ref must match the exact FR-17 derivation registered for that slot.

For activation, that derivation must actually be executable under FR-17: reviewed definition, reviewed algorithm, evidence/calibration, and executable dependencies.

Current FR-17 executable derivation count remains zero.

### unimplemented

The slot carries no source ref and cannot appear in a verified implementation.

## 6. Provenance requirements

The consumer contract requires:

```text
canonical asset digest = SHA-256
adapter source pin = required
runtime artifact digest = required for activation
provider run ref = required
raw source persisted = false
raw provider response persisted = false
biometric embedding persisted = false
```

These requirements preserve the FR-15 neutral observation privacy/provenance boundary.

## 7. Semantic authority is explicitly excluded

FR-22 hard-codes all of the following to false:

```text
traditionalSemanticOutputAllowed
providerLandmarkIndexInNeutralOutputAllowed
providerSideLabelToAnatomicalSideAllowed
dynamicAppearanceAsStaticGeometryAllowed
llmVisionSemanticAuthorityAllowed
thirdPartySourceEquivalenceIsSemanticAuthority
```

This distinction is important:

```text
third-party source/build provenance
≠ Face Reading semantic authority
```

FR-18 release-exact provenance may still matter for supply-chain reproducibility and provider implementation assurance. It is not the source of traditional meaning.

## 8. Why release-exact FR-18 remains unresolved without blocking semantic ownership

FR-18 v0.2 established the exact consumer lockfile tarball URL and SRI but not upstream source/build equivalence.

FR-22 does not falsify that state or declare it solved.

Instead it creates a separate MyeongHa-owned conformance boundary:

```text
third-party artifact identity/provenance
→ implementation evidence

MyeongHa provider contract + adapter/source pin + runtime digest + conformance tests
→ neutral observation implementation conformance

MyeongHa methodology/rules
→ traditional semantic authority
```

A future provider can therefore be evaluated against MyeongHa's neutral contract without pretending that an upstream git snapshot itself defines Face Reading meaning.

## 9. Current activation blockers

Even with the FR-22 contract present, current provider activation remains blocked because:

- no FR-22 implementation attestation is registered,
- FaceLab compatibility is still `evaluation_contract_only`,
- FR-14 provider neutral contract version is still null,
- FR-16 direct eye topology mappings remain research-only,
- FR-17 required nose/brow/midline derivations are not executable,
- no independently recorded runtime artifact digest/conformance evidence exists for a verified implementation.

Thus FR-22 does not activate MediaPipe or FaceLab.

## 10. Prohibited promotions

FR-22 blocks:

```text
provider output → traditional semantic authority
provider landmark index → neutral contract output
provider side label → anatomical side
consumer lockfile → implementation conformance
implementation conformance → traditional semantic authority
unreviewed derivation → provider slot
```

## 11. Relationship to FR-21A / FR-21B

FR-22 does not alter laterality gates.

```text
ordinary upload anatomical side remains unresolved
FR-20 anatomical-side consumption remains blocked
FR-21A anatomical-side production promotion remains blocked
FR-21B controlled capture remains design-only / no verified profiles
```

Even a future FR-22-conforming neutral provider cannot claim anatomical side unless the capture/laterality authority independently supports it.

## 12. Next evidence needed

The next provider implementation phase must provide an actual provider-side neutral schema/version and adapter implementation, then pin:

- source commit/blob,
- runtime artifact digest,
- conformance evidence,
- exact neutral slot source mappings,
- reviewed FR-17 derivations where required.

Until those exist, `providerActivationAllowed=false` remains the exact repository state.
