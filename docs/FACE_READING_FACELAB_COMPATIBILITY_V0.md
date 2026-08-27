# MyeongHa Face Reading × Visually/Bejewely FaceLab Compatibility v0.1

> Date: 2026-08-27  
> Status: **FR-1 COMPATIBILITY AUDIT — PRODUCTION BRIDGE BLOCKED, CONTRACT PATH CONFIRMED**  
> Visually source inspected: `gycha0109-beep/K_beauty@main`

## 1. Audit verdict

The two engines should share **neutral face observation**, not each other's semantic output.

Target:

```text
                       Shared Face Observation Core
                       /                          \
                      /                            \
              Visually FaceLab              MyeongHa Face Engine
              style authority               physiognomy authority
```

Current implementation verdict:

```text
shared-core architecture = compatible
current production runtime adapter = BLOCKED
```

Reason: `K_beauty` currently exposes `@bejewely/face-contracts`, but the concrete observation contract found in the package is explicitly a **synthetic/blind evaluation observation contract**, not a stable production-neutral FaceLab output API.

MyeongHa must not bind production runtime to that synthetic contract.

## 2. What exists in K_beauty now

`packages/face-contracts/README.md` defines the package as the shared boundary for production and non-production evaluation tooling and limits it to contracts, schemas, versions, validators and invariants.

The exported concrete observation contract inspected is:

```text
packages/face-contracts/src/synthetic-observation/observation-contract.js
```

It defines, among others:

```text
OBSERVATION_CONTRACT_SNAPSHOT_SCHEMA_VERSION
OBSERVATION_RUN_REQUEST_SCHEMA_VERSION
SYNTHETIC_OBSERVATION_OBJECT_SCHEMA_VERSION
SYNTHETIC_OBSERVATION_RUN_SCHEMA_VERSION
BLIND_JUDGMENT_INPUT_SCHEMA_VERSION
```

and the pinned profile:

```text
id      = bejewely-canonical-vision-v1
version = 1.0.0
providerModel = gpt-4o-mini
fixtureModel  = fixture-canonical-v1
```

This is useful evidence that FaceLab already treats observation as a versioned authority boundary.

## 3. Invariants worth carrying into Shared Face Observation Core

The synthetic contract already enforces several design choices that MyeongHa should preserve when the production neutral contract is introduced.

### Canonical input pinning

```text
canonical asset sha256
+ objectRelativePath
+ transformPolicyVersion = canonical-image-v1
```

### Execution pinning

```text
adapter profile id/version
+ contract snapshot id
+ execution mode
+ requested model
+ replicate ordinal
```

### Privacy boundary

Blind judgment input is created only when:

```text
sourceImagePersisted === false
rawProviderResponsePersisted === false
```

This is directly compatible with MyeongHa Face Reading's ephemeral raw-image policy.

### Provenance integrity

The observation object/run is bound to:

```text
candidate ID
canonical image SHA-256
contract snapshot digest
observation digest
```

The production shared core should keep the same class of provenance even if identifiers/schemas change.

## 4. Why direct reuse is blocked

The current concrete contract is about a synthetic evaluation pipeline. It does not establish a production-neutral schema for the physiognomy inputs MyeongHa needs.

Missing or not yet established as a stable exported production contract:

```text
face count / section usability semantics
pose contract
occlusion contract
landmark provenance
versioned metric registry
metric confidence
multi-view agreement
outline / vertical balance / feature layout production schema
static-vs-dynamic appearance separation
```

Therefore this is forbidden:

```text
MyeongHa production
→ imports synthetic-observation-object-v1
→ treats it as FaceLab production API
```

## 5. MyeongHa consumer contract

MyeongHa now owns a forward-compatible consumer boundary:

```ts
interface FaceLabNeutralObservationProvider {
  providerKey: 'visually_facelab';
  providerContractVersion: string;

  getObservation(input: {
    sourceRef: string;
    requestId: string;
  }): Promise<SharedFaceObservationBundleV3>;
}
```

The runtime bridge remains fail-closed while compatibility state is:

```text
evaluation_contract_only
```

Once FaceLab publishes a stable neutral contract, only a provider-side mapping should be required. Face Reading methodology/rules must not change because of FaceLab transport/schema details.

## 6. Required FaceLab-side neutral schema for future integration

Recommended minimum capability:

```text
schemaVersion
capabilityVersion
extractorVersion
modelVersion

eligibility
  status
  humanFaceCount
  reasons[]

quality
  pose.yaw/pitch/roll
  sharpness
  exposure
  lighting
  occludedRegions[]

geometry.metrics[]
  metricKey
  metricVersion
  value
  unit
  confidence
  viewAgreement?
  sourceLandmarks[]?

observations
  outline
  verticalBalance
  eyes
  featureLayout
  visualLanguage
  colorAppearance?   # separate dynamic channel

evidenceRefs[]
```

MyeongHa static V1 adapter removes `colorAppearance` even if FaceLab supplies it.

## 7. Explicit semantic non-coupling

Forbidden:

```text
FaceLab animal/archetype label
→ physiognomy evidence

FaceLab styling score
→ 十二宮 / 五官 / 三停 claim

MyeongHa 관상 diagnosis
→ FaceLab beauty/style authority
```

Allowed:

```text
neutral jaw/face ratio
→ FaceLab style reasoning

same neutral jaw/face ratio
→ reviewed MyeongHa traditional operationalization
```

Same observation, separate semantic authority.

## 8. Future UX bridge

Once both engines are production-ready, a cross-product experience can be added without merging semantics:

```text
MyeongHa
"전통 관상에서 중정과 책임축이 두드러지는 얼굴"

→ [이 얼굴의 강점을 스타일로 살리기]

Visually FaceLab
"structured / authoritative styling direction"
```

This is navigation/composition at product level. It is not evidence transfer.

## 9. FR-1 acceptance status

- [x] actual K_beauty face-contract package inspected
- [x] actual concrete observation contract inspected
- [x] reusable privacy/provenance invariants identified
- [x] synthetic evaluation contract explicitly rejected as production API
- [x] consumer-side future provider contract implemented
- [x] production bridge fail-closed test implemented
- [ ] production-neutral FaceLab observation schema available
- [ ] real FaceLab → SharedFaceObservationBundleV3 adapter
- [ ] cross-repo contract fixture test

FR-1 therefore closes as **COMPATIBILITY PATH ESTABLISHED / RUNTIME ADAPTER DEFERRED UNTIL FACELAB CONTRACT EXISTS**.
