# Character Runtime Asset Authority Request v1

> 상태: **GATE A APPROVED / GATE B-C BLOCKED / PRODUCTION BLOCKED**  
> 승인 기준 proposal head: `5d741d5415b9620e1c9fe0d0f64c57f8db139e08`  
> 동기화 기준 main: `3d7b5ce1465b4c75268b83325cda1e0305b29b46`  
> 범위: Launch 9 Character의 renderer/runtime asset provenance와 ContentBundle asset manifest 입력 권한 정의  
> 비범위: 기존 semantic/runtime/immutable canon 변경, concrete asset payload 승인, ContentBundle/ContentRelease ID 생성, DB publication, release activation, Vercel deployment, positive Member Chat Production E2E

## 0. Product Owner decision

Product Owner가 현재 대화에서 **“Gate A 승인”**이라고 명시적으로 결정했다.

따라서 proposal head `5d741d5415b9620e1c9fe0d0f64c57f8db139e08`에 정의된 **Gate A — Authority contract**만 승인한다.

```text
proposal: Character Runtime Asset Authority Request v1
proposal head: 5d741d5415b9620e1c9fe0d0f64c57f8db139e08
decision: APPROVE GATE A ONLY
Gate B: NOT APPROVED
Gate C: NOT APPROVED
```

이 승인은 아직 존재하지 않는 concrete `assetRefs`, `emotionIds`, `animationCueIds`, `assetManifestHash`를 승인하거나 생성 권한을 부여하지 않는다. Production DB write, release activation, catalog publication, positive Member Chat Production E2E도 승인하지 않는다.

## 1. Why this request exists

현재 승인된 immutable visual authority는 visual canon을 authored baseline으로 승인하지만 실제 renderer asset provenance로 승격하지 않는다.

현재 source authority는 다음 값을 승인하지 않았거나 제공하지 않았다.

```text
emotionIds / animationCueIds
actual image files / asset refs / provenance
asset manifest hash
ContentBundle IDs
ContentRelease IDs
runtime catalog rows
Production publication
```

현재 Character content schema는 다음 publication inputs를 보유한다.

```text
CharacterContentDefinition.assetRefs
CharacterContentDefinition.emotionIds
CharacterContentDefinition.animationCueIds
CharacterContentBundle.assetManifestHash
```

Production validator는 `assetManifestHash`에 source-backed `sha256:v1:<64 lowercase hex>` provenance contract를 요구하며 synthetic 또는 digest-shaped placeholder를 Production provenance로 인정하지 않는다.

따라서 승인되거나 source-backed되지 않은 asset 값을 추론해서 채우지 않고 Production publication은 fail closed를 유지한다.

## 2. Canonical launch roster boundary

이 요청은 현재 승인된 Launch 9 Character에만 적용한다.

| characterId | displayName |
| --- | --- |
| `seyeon` | 세연 |
| `yeoul` | 여울 |
| `seorin` | 서린 |
| `rahyeon` | 라현 |
| `mira` | 미라 |
| `taegyeom` | 태겸 |
| `yunho` | 윤호 |
| `doyun` | 도윤 |
| `baekheon` | 백헌 |

다음은 허용하지 않는다.

- Launch roster 외 Character 추가;
- 누락 또는 중복 Character;
- 기존 canonical `characterId` 변경;
- visual prose를 근거로 asset topology나 renderer ID 추론.

## 3. Approval is staged

### Gate A — Authority contract approval — APPROVED

Product Owner 승인에 따라 다음 **계약 자체만** authoring authority로 승격한다.

1. renderer/runtime asset manifest에는 명시적 source-of-truth와 provenance owner가 있어야 한다.
2. manifest hash contract는 `sha256:v1:<64 lowercase hex>`를 사용한다.
3. Launch 9명 각각에 source-backed `assetRefs`, `emotionIds`, `animationCueIds`가 정의되어야 한다.
4. 모든 concrete value는 기존 canonical Character ID에 매핑되어야 한다.
5. published immutable ContentBundle에 들어간 concrete asset payload는 bundle provenance와 함께 version-pinned 되어야 한다.
6. 필수 provenance/value 누락 또는 불일치는 fail closed한다.
7. placeholder, synthetic digest, guessed renderer ID는 Production authority가 아니다.

**Gate A 승인은 아직 존재하지 않는 구체 asset 값을 승인하지 않는다.**

### Gate B — Concrete asset payload approval — BLOCKED

Gate B는 별도 검토 가능한 정확한 source-backed payload가 준비된 뒤에만 승인할 수 있다.

필수 evidence:

```text
source provenance identifier/reference
exact assetManifestHash
per-Character exact assetRefs
per-Character exact emotionIds
per-Character exact animationCueIds
cue schema / current Production Web Client compatibility evidence
```

구체 값은 source authority가 확보되기 전에 본 문서에 임의로 채우지 않는다.

### Gate C — Production publication authorization — BLOCKED

Gate C는 Gate A/B와 별개다.

Production DB publication 전 최소 다음이 필요하다.

```text
repo-authorized ContentBundle/ContentRelease/catalog mutation path
immutable bundle verification
default-release uniqueness and approved replacement semantics
DB ACL / RLS / executor authority verification
exact-head CI
Production database verification
```

Asset authority 계약 승인만으로 Production DB write 또는 release activation을 허가하지 않는다.

## 4. Preservation constraints

본 승인 및 후속 구현은 다음 authority를 변경하지 않는다.

- 승인된 Character semantic baseline;
- 승인된 immutable identity / Deity / visual canon;
- 승인된 #555 runtime Speech / Persona / Behavior / RelationshipBehavior / Saju authoring;
- Launch 9 uniform Member availability 정책;
- active default release 교체 시 기존 default를 active non-default로 유지하는 정책;
- Member + Character single active thread create/reuse 및 pinned release/bundle 정책.

추가 불변조건:

- visual description에서 실제 asset ref를 추론하지 않는다.
- `emotionIds` 또는 `animationCueIds`를 renderer 구현 관행으로 추측하지 않는다.
- synthetic/placeholder `assetManifestHash`를 만들지 않는다.
- General Natal 및 다른 Saju upstream Production authority는 독립적으로 fail closed한다.
- 관계 stage/history/lore를 본 asset authority로 추가하지 않는다.

## 5. Required concrete approval payload

Gate B용 payload는 최소 다음 형식을 가져야 한다.

| characterId | assetRefs[] | emotionIds[] | animationCueIds[] |
| --- | --- | --- | --- |
| `seyeon` | source-backed only | source-backed only | source-backed only |
| `yeoul` | source-backed only | source-backed only | source-backed only |
| `seorin` | source-backed only | source-backed only | source-backed only |
| `rahyeon` | source-backed only | source-backed only | source-backed only |
| `mira` | source-backed only | source-backed only | source-backed only |
| `taegyeom` | source-backed only | source-backed only | source-backed only |
| `yunho` | source-backed only | source-backed only | source-backed only |
| `doyun` | source-backed only | source-backed only | source-backed only |
| `baekheon` | source-backed only | source-backed only | source-backed only |

Bundle-level evidence:

```text
assetManifestSource
assetManifestHash
cueSchemaVersion
minClientCapability
provenance evidence/reference
```

`source-backed only`는 placeholder 값이 아니라 **아직 concrete value를 제시하지 않았음을 나타내는 문서 표기**다. 이 표 자체를 runtime payload로 사용할 수 없다.

## 6. Decision state

```text
Gate A — Authority contract              APPROVED by Product Owner
Gate B — Concrete asset payload          BLOCKED pending source-backed payload + separate PO decision
Gate C — Production publication          BLOCKED pending Gate B + publication mutation authority + separate authorization
```

Gate A의 승인 exact proposal snapshot은 `5d741d5415b9620e1c9fe0d0f64c57f8db139e08`이다. 이후 Gate A 계약의 substantive 의미를 바꾸면 재승인이 필요하다.

## 7. Production consequence

Gate B와 Gate C가 닫히기 전까지:

```text
Production Character publication          BLOCKED
arbitrary Supabase Character insertion     FORBIDDEN
synthetic asset provenance                 FORBIDDEN
positive Member Chat Production E2E        BLOCKED pending real published Character/content
```
