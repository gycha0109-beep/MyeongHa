# MyeongHa Face Reading FR-23 — Provider Conformance Evidence v0.1

Status: implementation-conformance evidence contract / zero registered evidence
Scope: machine-checkable evidence required for an FR-22 provider implementation
Baseline: FR-22 MyeongHa-owned Face Observation Provider Contract v0.1

## 1. Decision

FR-22 defines what a provider implementation must satisfy. FR-23 defines how conformance to that contract must be evidenced.

The split is:

```text
third-party package / adapter
→ implementation material

FR-22
→ MyeongHa neutral provider contract

FR-23
→ implementation conformance evidence

traditional Face Reading methodology / operationalization / rules
→ semantic authority
```

FR-23 does not grant traditional semantic authority and does not establish anatomical laterality.

## 2. Current authority state

The merged v0.1 evidence registry is intentionally empty:

```text
FACE_OBSERVATION_PROVIDER_CONFORMANCE_EVIDENCE_FR23 = []
```

Therefore no provider implementation can become an activation candidate through FR-23 today.

This is deliberate. A string such as:

```text
evidence.conformance.some-run
```

is not evidence merely because it appears in an FR-22 implementation attestation.

## 3. Evidence identity binding

Every FR-23 evidence record must bind to one exact FR-22 implementation using:

```text
implementationRef
FR-22 consumerContractRef
providerContractVersion
runtimeArtifactDigest
adapter repository
adapter commit
adapter source path
adapter source blob SHA
fixtureCorpusDigest
suiteRef
executionRef
```

The runtime artifact digest must exactly match the independently recorded digest in the FR-22 implementation attestation.

The adapter source pin must also exactly match the implementation attestation. This prevents conformance results from one adapter build being replayed as authority for another.

## 4. Required conformance checks

Every evidence run must contain exactly one result for all ten checks:

```text
contract_shape
capability_coverage
slot_geometry_shape
slot_source_authority
deterministic_replay
provenance_binding
privacy_non_persistence
failure_fail_closed
laterality_non_authority
semantic_non_authority
```

No check can be omitted or duplicated.

Each result records:

```text
checkId
result = pass | fail
assertionCount > 0
resultArtifactDigest = sha256:<64 lowercase hex>
```

A future reviewed evidence record requires every check to pass.

## 5. What the checks mean

### contract_shape

The produced neutral observation must conform to the MyeongHa-owned FR-15/FR-22 structure rather than a provider-native evaluation object.

### capability_coverage

The implementation must actually support the neutral capabilities required by the slots it claims to implement.

### slot_geometry_shape

Each slot must produce the MyeongHa geometry class required by the contract: point, curve, or region as applicable.

### slot_source_authority

The implementation cannot invent provider-index subsets or unreviewed geometry derivations. Slot source authority remains bounded by FR-16 and FR-17.

### deterministic_replay

The same pinned runtime implementation and fixture input must produce evidence suitable for deterministic contract verification. This is implementation conformance evidence, not proof that Face Reading semantics are scientifically true.

### provenance_binding

Outputs and test artifacts must remain bound to the pinned adapter source, runtime digest, fixture corpus, execution, and provider run provenance.

### privacy_non_persistence

The FR-15 prohibition on raw source persistence, raw provider response persistence, and biometric embedding persistence must remain enforceable.

### failure_fail_closed

Unavailable, malformed, or unsupported provider observations must not be silently converted into positive semantic evidence.

### laterality_non_authority

Provider side labels and image-space ordering cannot establish anatomical side. FR-19/20/21 authority remains separate.

### semantic_non_authority

Provider output and conformance success cannot directly create traditional physiognomy or fortune claims.

## 6. Candidate vs reviewed evidence

FR-23 supports two evidence review states:

```text
candidate
reviewed
```

Candidate evidence can be used during implementation work but cannot establish provider readiness.

Reviewed evidence additionally requires:

```text
FR-22 implementation reviewState = verified
all ten checks = pass
reviewerEvidenceRefs.length > 0
```

The current repository cannot satisfy this because FR-22 itself cannot currently produce a verified implementation from the existing FR-16/17 source state.

## 7. Current blockers are preserved

FR-23 does not bypass any existing blocker:

```text
FR-22 verified implementation registry = empty
FR-23 conformance evidence registry = empty
FR-17 executable neutral derivations = 0
FR-16 direct eye topology = research-only
FaceLab compatibility = evaluation_contract_only
FR-14 providerContractVersion = null
FR-21B verified capture profiles = 0
ordinary upload anatomical laterality = unresolved
FR-18 source/build equivalence = unresolved
```

FR-18 source/build equivalence is not traditional semantic authority. FR-23 requires an independently recorded runtime implementation digest because implementation conformance needs a concrete artifact identity, not because package provenance defines Face Reading meaning.

## 8. No arbitrary evidence-ref promotion

FR-23 readiness requires registry membership. Supplying an object with a plausible evidenceRef does not make it authoritative.

The current registry has zero records, so even a structurally valid candidate run remains blocked.

This closes the gap between:

```text
FR-22 conformanceEvidenceRefs: string[]
```

and an actually reviewable, content-addressed conformance record.

## 9. Activation remains false

FR-23 v0.1 also observes the FR-22 contract-level state:

```text
providerActivationAllowed = false
```

Therefore:

```text
providerActivationCandidate = false
```

for the current repository snapshot regardless of caller-supplied candidate objects.

## 10. Next implementation evidence required

A real provider implementation phase must supply all of the following before FR-23 can move beyond the empty registry:

- a real provider-side neutral contract version,
- a repository/blob-pinned adapter implementation,
- an independently recorded runtime artifact SHA-256 digest,
- a content-addressed conformance fixture corpus,
- an actual FR-23 suite execution,
- ten complete check artifacts,
- reviewed conformance evidence,
- source mappings that are independently authorized by FR-16/17,
- FR-22 verified registry entry.

Until then FR-23 is a conformance gate, not an activation grant.