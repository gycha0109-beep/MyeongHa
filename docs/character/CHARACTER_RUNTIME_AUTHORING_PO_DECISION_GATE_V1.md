# Character Runtime Authoring v1 — Product Owner Decision Gate

> 상태: **PRODUCT OWNER APPROVED / RUNTIME AUTHORING AUTHORIZED / NOT PRODUCTION PUBLICATION**  
> proposal package:
> - `CHARACTER_RUNTIME_AUTHORING_PROPOSAL_V1.md`
> - `CHARACTER_RUNTIME_SPEECH_PROPOSAL_V1.md`
> - `CHARACTER_RUNTIME_SAJU_UPSTREAM_AUTHORITY_CONSTRAINT_V1.md`

## 1. Decision

Product Owner decision:

```text
승인.
```

Decision state:

```text
Decision: APPROVED
Runtime authoring authority: AUTHORIZED FOR TYPED TRANSLATION
Production publication: NOT YET AUTHORIZED BY THIS DECISION ALONE
```

Approval recorded: `2026-09-07`.

## 2. Approved exact proposal snapshot

The approved substantive proposal snapshot is the proposal package as it existed at PR #555 head:

```text
009dc8b9d9b324f480b3d1782da9df311f08f8da
```

The later synchronization onto newer `main` does not change the approved Speech / Persona / Behavior / Saju / RelationshipBehavior candidate values. It only records this Product Owner decision and refreshes the branch ancestry.

Any substantive change to the approved proposal values creates a new proposal snapshot and requires an explicit review of whether renewed Product Owner approval is needed.

## 3. Approval surface

The Product Owner approval covers the complete candidate surface below:

```text
A. stable question / avoid / behavior trigger key vocabulary
B. behavior priority convention
C. 9-character exact Speech profile values
D. 9-character exact Persona profile strings + strategy keys
E. 9-character Behavior ruleKey / triggerKey / priority / response / avoid values
F. 9-character Saju capability role matrix + canInitiate rule
G. 9-character SajuProfile axes / follow-up / framing / uncertainty / referral values
H. 9-character fixed Saju safe-framing catalogs
I. 9-character RelationshipBehavior default modes + event/band-conditioned rules
```

Approved launch roster:

```text
세연 / 여울 / 서린 / 라현 / 미라 / 태겸 / 윤호 / 도윤 / 백헌
```

## 4. Explicit exclusions

This decision does not independently authorize or invent:

```text
asset provenance / assetManifestHash
assetRefs
emotionIds
animationCueIds
ContentBundle ID/version
Content Release / Catalog rows
Production publication
positive Member Chat Production E2E completion
shared history / family history / social history
inter-character past canon not already approved upstream
arbitrary relationship stage keys
unsupported Saju methodology / rule / interpretation authority
```

General Natal remains governed by its upstream Production authority. Character-side capability metadata cannot bypass that boundary.

## 5. Technical constraint summary

Approved candidate values remain bounded by current repository contracts:

```text
SajuDomain:
  general / family / relationship / compatibility / career / business / wealth / life_stage / question_specific

RelationshipStateBand:
  low / medium / high

RelationshipEventCandidate:
  FIRST_MEETING
  RETURN_VISIT
  CHOSE_CHARACTER
  SHARED_PERSONAL_FACT
  COMPLETED_READING
  FINISHED_EPISODE
  CONFLICT_EVENT
  RECONCILIATION_EVENT
  IGNORED_CHARACTER
  RETURNED_AFTER_ABSENCE
```

No repository-authoritative relationship stage registry was identified for this proposal snapshot, so v1 does not invent `stageKeys`.

## 6. Upstream Saju fail-closed rule

Character capability is presentation/routing authority only. Effective execution requires upstream Saju Production authority as well.

```text
effectiveCanInitiate =
  characterCapability.canInitiate
  AND upstreamDomainProductionAuthorized
```

Therefore a Character candidate with `canInitiate=true` still resolves to effective initiation `false` for a domain whose Production methodology/rule/interpretation authority is blocked.

## 7. Publication boundary

This approval authorizes the next implementation step:

```text
approved proposal
→ schema-valid typed Character runtime authoring source
```

It does not itself create or activate:

```text
ContentBundle
ContentRelease
runtime catalog rows
Production Character rows
Production assets
Member Chat positive E2E closure
```

Those require their own repository-authorized implementation, CI, merge, publication, and Production verification gates.
