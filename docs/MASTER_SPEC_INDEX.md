# 명하 Master Specification Index — Full Audit v0.4

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-30**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`, Face Reading FR-0 source/methodology authority  
> Rule: 본 문서는 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다.

---

## 1. 목적

이 Pack은 명하의 구현을 여러 문서로 나누되 **authority가 다시 분열되지 않게 하는 구현 명세 묶음**이다.

현재 source authority가 고정한 핵심은 다음이다.

```text
Saju Engine
→ 명리적으로 무엇을 해석할 수 있는가

Face Reading Engine
→ 얼굴의 중립 observation을 전통 관상 방법론으로 무엇이라 해석할 수 있는가

Myeongha Product
→ 누구의 어떤 입력/대화/관계/권한/결과인가

Character Runtime
→ 이미 허용된 의미를 어떤 캐릭터 화법으로 전달하는가
```

`Shared Face Observation Core`는 사진에서 관찰 가능한 중립 구조만 소유한다. Visually FaceLab과 MyeongHa Face Reading Engine은 이 중립 observation을 공유할 수 있지만 서로의 style/archetype semantic result와 관상 semantic result를 authority 입력으로 사용할 수 없다.

## 2. Authority Resolution Matrix

문서 전체에 대한 단일 선형 우선순위를 사용하지 않는다. 서로 다른 문서는 서로 다른 authority domain을 소유한다.

| Authority Domain | Primary Source | Pack Implementation Owner |
|---|---|---|
| Saju semantic meaning / methodology / T0~T11 / narrative truth | `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md` + Saju public product contract | `SAJU_INTEGRATION_SPEC.md`, `AI_CHARACTER_RUNTIME_SPEC.md` |
| Face Reading semantic meaning / source lineage / F0~F8 / comparison authority | Face Reading v0.3 architecture + `FACE_READING_SOURCE_METHOD_INVENTORY_V0.md` | `packages/face-reading`, `FACE_READING_IMPLEMENTATION_BASELINE_V0.md` |
| Product UX / user journey / character-world behavior | `Usecase_re_reviewed_v2(1).md` | API / AI / Content / Client specs |
| Persistence / PK-FK-UNIQUE / relational provenance | `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md` | `DB_DDL_MIGRATION_SPEC.md` |
| Authentication / privacy / authorization implementation | Use Case privacy boundary + ERD ownership | `AUTH_RLS_PRIVACY_SPEC.md` |
| Commerce entitlement behavior | Use Case commerce boundary + ERD commerce ledger | `COMMERCE_ENTITLEMENT_SPEC.md` |
| Runtime contract enums / command schemas | Above authorities combined | `SHARED_DOMAIN_CONTRACTS_SPEC.md` |

충돌 처리 규칙:

1. 같은 authority domain 안에서만 primary source가 우선한다.
2. 서로 다른 domain의 문서를 통째로 서로 위에 두지 않는다.
3. source끼리 직접 충돌하면 Pack이 임의 선택하지 않고 `SOURCE_AUTHORITY_GAPS.md`에 blocker로 등록한다.
4. Pack 내부 provisional 문구보다 `P0_DECISION_REGISTER.md`의 `DECIDED` 항목이 우선한다.
5. 구현이 source authority를 만족할 수 없는 경우 source 수정 없이 우회 구현하지 않는다.
6. 관상 source의 전자 transcription과 NLC witness가 다르면 scan-checked witness가 우선하며, 전자 transcription만으로 production rule을 승격하지 않는다.
7. 동일 문구가 계통상 인용/전승 관계에 있으면 독립 근거 여러 개로 계산하지 않는다.

### Current Saju integration audit pin

Pack v0.3의 current public-contract compatibility 검수는 `gycha0109-beep/Saju@7102dc8fe8483c0875f6a093a4fd585b0df51f8b`를 기준으로 했다. 이후 Saju main이 바뀌면 `SAJU_INTEGRATION_SPEC`의 exact-contract fixture를 다시 실행해야 하며 단순 branch 이름만으로 호환을 가정하지 않는다.

### Current Face Reading research pin

Face Reading FR-0는 2026-08-27 연구 snapshot을 기준으로 한다. `神相全編 / 人倫大統賦 / 麻衣相法 / 柳莊相法` witness와 Kohn 1986 lineage record를 registry에 등록했지만, 최초 production rule은 아직 존재하지 않는다. Production promotion은 exact scan passage + metric/region operationalization + deterministic test를 모두 요구한다.

## 3. 문서 목록

| 순서 | 문서 | 목적 |
|---|---|---|
| 00 | `MASTER_SPEC_INDEX.md` | 전체 authority / dependency map |
| 00A | `P0_DECISION_REGISTER.md` | 미결정 P0 단일 원장 |
| 00B | `SOURCE_AUTHORITY_GAPS.md` | source 문서 간 충돌/누락 blocker 원장 |
| 00C | `SPEC_TRACEABILITY_MATRIX.md` | UC → API/DB/spec/test 추적성 |
| 00D | `SHARED_DOMAIN_CONTRACTS_SPEC.md` | bounded enums / action / event / schema registry |
| 01 | `DB_DDL_MIGRATION_SPEC.md` | ERD → PostgreSQL DDL / trigger / RLS / migration |
| 01A | `SERVER_COMMAND_TRANSACTION_SPEC.md` | multi-table command atomicity / lock / external-call boundary |
| 02 | `API_CONTRACT.md` | Web/Mobile 공용 HTTP contract |
| 03 | `AI_CHARACTER_RUNTIME_SPEC.md` | Planner/Context/Renderer/Guard/Scene runtime |
| 04 | `CHARACTER_WORLD_CONTENT_SPEC.md` | 캐릭터·신·canon·episode content bundle contract |
| 05 | `SAJU_INTEGRATION_SPEC.md` | Product ↔ Saju boundary / retry / grounding |
| 05A | `FACE_READING_SOURCE_METHOD_INVENTORY_V0.md` | 관상 source witness / passage / lineage / methodology inventory |
| 05B | `FACE_READING_IMPLEMENTATION_BASELINE_V0.md` | Face Reading FR-0 executable authority boundary |
| 06 | `AUTH_RLS_PRIVACY_SPEC.md` | Guest/Member ownership, RLS, deletion, privacy |
| 07 | `RELATIONSHIP_MEMORY_POLICY_SPEC.md` | 관계 ledger, Life Fact, Memory, grants |
| 08 | `COMMERCE_ENTITLEMENT_SPEC.md` | purchase/provider/grant/entitlement authority |
| 09 | `NOTIFICATION_RETURN_LOOP_SPEC.md` | Push, inbox, return-loop, privacy preview |
| 09A | `COST_QUOTA_ABUSE_SPEC.md` | rate limit, AI/Saju budget, quota, abuse/anti-farming |
| 09B | `ANALYTICS_EXPERIMENT_SPEC.md` | analytics schema, privacy, experiment assignment/boundary |
| 10 | `WEB_MOBILE_CLIENT_ARCHITECTURE_SPEC.md` | Web/App 공통/분리 책임과 client state |
| 10A | `UX_SCREEN_STATE_SPEC.md` | 화면/상태 semantics, retry/clarification/delete UX |
| 11 | `VERIFICATION_E2E_TEST_PLAN.md` | contract/security/concurrency/E2E gate |
| 12 | `RELEASE_OBSERVABILITY_SPEC.md` | release, content rollout, telemetry, incident evidence |
| 13 | `PACK_VALIDATION_REPORT.md` | 이 Pack 자체 정합성 검수 결과 |

## 4. 구현 의존성

```text
P0 Decision Register
        │
        ├─────────────────────────────┐
        ▼                             ▼
DB DDL/RLS                        Content Canon
        │                             │
        ├──────────────┬──────────────┘
        ▼              ▼
      API        Character Runtime
        │              │
        ├───────┬──────┘
        ▼       ▼
 Saju Adapter   Face Grounding Adapter
        │       ▲
        │       │
        │   Face Reading Engine
        │       ▲
        │       │
        │ Shared Face Observation Core
        │
   ┌────┼────────┐
   ▼    ▼        ▼
Relation Commerce Notification
   │    │        │
   └─ Cost/Quota ┤
        │        │
   Analytics ────┘
        ▼
   Web / Mobile
        ▼
    E2E Gates
        ▼
Release / Observability
```

## 5. 공통 불변식

모든 구현은 다음을 MUST 만족한다.

- Saju 의미는 Saju Engine 밖에서 생성하지 않는다.
- Face Reading 의미는 Face Reading Engine 밖에서 생성하지 않는다.
- Shared Face Observation Core는 중립 observation만 제공하며 FaceLab style/archetype 결과나 관상 diagnosis를 생성하지 않는다.
- MyeongHa static Face Reading v1은 `observations.colorAppearance`를 소비하지 않는다.
- 관상 production rule은 `scan_checked` 이상 source passage 없이는 승격하지 않는다.
- 관상 source genealogy의 인용/파생 문헌을 독립 evidence count로 중복 계산하지 않는다.
- `strongest/weakest` 같은 ordinal wording은 methodology-defined ordering authority 없이는 사용하지 않는다. 그 경우 `most salient` 계열만 허용한다.
- 관상 semantic reading과 consumer prose를 같은 contract에 섞지 않는다.
- 캐릭터는 Saju/Face Reading 의미를 표현하지만 새 semantic authority가 아니다.
- 사용자 장기 기억은 사용자 승인 없이 확정 저장하지 않는다.
- 관계 점수/해금/entitlement는 client/LLM이 직접 쓰지 않는다.
- Web/Mobile은 서버 authority의 client다.
- retry와 동시접속을 기본 전제로 idempotency/concurrency를 설계한다.
- user-owned resource는 object-level authorization을 통과해야 한다.
- canon content와 runtime operational state를 분리한다.
- 과거 Birth revision / Reading / ledger provenance를 조용히 덮어쓰지 않는다.
- DB commit과 외부 side effect는 transactional outbox로 분리한다.
- LLM이 생성한 문자열/JSON을 tool/action/fact/event identifier로 그대로 실행하지 않는다. 모든 실행 ID는 versioned bounded registry를 통과한다.
- Saju-bearing consumer text는 source Saju architecture의 deterministic narrative boundary를 우회하지 않는다.
- scenario/ambiguity가 material하면 Character context까지 구조적으로 보존한다.
- verified commerce source에서 concrete entitlement/grant target을 결정하는 mapping authority는 `SRC-18`이 해결한 source-defined contract만 사용한다. Pack이 `ProductFulfillmentDefinition`이나 fulfillment version/hash registry를 선행 가정하지 않는다.
- Saju public Product contract를 raw JSON 구조 추정으로 재정의하지 않는다. 실제 exported `ProductReadingResponse` / host input contract와 adapter spec이 다르면 `SOURCE_AUTHORITY_GAPS.md`에서 닫기 전 real integration을 production-ready로 부르지 않는다.
- source가 실제로 정의한 versioned registry/artifact의 같은 version key는 immutable content를 가리켜야 하며 runtime에서 조용히 의미를 바꾸지 않는다. `SRC-18` commerce fulfillment mapping, `SRC-22` relationship policy artifact/schema, `SRC-32` notification scheduler policy artifact/versioning이 해결되기 전에는 해당 registry/artifact의 존재나 hash identity를 공통 전제로 만들지 않는다.

## 6. 미결정 사항 취급

`OPEN-P0`는 구현자가 임의로 결정해서는 안 된다.

예:

```text
OPEN-P0: P0-SA-01
```

이 표기가 있는 분기는 interface/adapter를 유지하고 특정 provider/rail에 hard-code하지 않는다.

Face Reading에서 source passage는 확보됐지만 modern geometry threshold나 region map이 검증되지 않은 경우에도 같은 원칙을 적용한다. 그 dimension은 research-only로 남기고 결과 다양성을 위해 threshold를 임의 생성하지 않는다.

## 7. 최초 구현 순서

```text
0. SOURCE_AUTHORITY_GAPS blocker resolution + P0 decision slots
1. Shared bounded contracts + source-backed immutable registry/artifact boundaries; unresolved policy/fulfillment artifact slots remain blockers
2. DB DDL draft + server-command transaction skeleton + constraint/RLS tests
3. API command skeleton
4. Character content schema + sample dev bundle
5. Chat turn state machine + AI runtime mock
6. Mock Saju Adapter
7. Birth / Life Fact / Memory / Relationship vertical slice
8. Real Saju Adapter with deterministic Saju-bearing rendering boundary
8A. Face Reading FR-0 source/claim/comparison authority foundation
8B. Shared Face Observation compatibility + FaceLab-neutral adapter contract
8C. scan-checked 三停 / 五官 / 十二宮 source passages + metric/region operationalization
8D. first F1/F2 rules → F3 configuration/tension → F7 bounded domain synthesis
8E. deterministic decisive Face Narrative + Character Face Grounding
9. Web + Mobile + UX screen-state vertical slice
10. Commerce / Notification + Cost/Quota
11. Analytics/Experiment contract wiring
12. E2E + release gates
```
