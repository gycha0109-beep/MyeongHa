# 명하 Master Specification Index — Full Audit v0.4

> Product: **명하 (Myeongha)**  
> Pack Version: **v0.4**  
> Date: **2026-08-30**  
> Source Authority: `Usecase_re_reviewed_v2(1).md`, `Myeongha_DB_ERD_v0.6_AUTHORITY_FIRST(2).md`, `Myeonghwa_Personalized_Interpretation_Architecture_v1.3_THIRD_REVIEW(1).md`, Face Reading FR-0 source/methodology authority  
> Rule: 본 문서는 source authority를 구현 수준으로 구체화한다. source가 결정하지 않은 사항은 임의 확정하지 않고 `OPEN-P0` 또는 `CANDIDATE`로 표시한다.

---

## 현재 설계 권위·스냅샷 적용 범위 (2026-10-28)

[설계 충돌·적용 범위 원장](architecture/ARCHITECTURE_AUTHORITY_COLLISION_REGISTER_20261028.md)은 기존 정본을 대체하는 새 아키텍처가 아니라, **후속 결정이 구형 구현 전제를 덮어쓰는 지점**과 타 트랙 인계 범위의 색인입니다.

- 최초 Use Case·ERD·Integration Spine의 핵심 소유권·보안·의미론 계약은 도메인별로 유효하나, 그 안의 `OPEN-P0`, 출시 인원, provider, 배포 상태, 최초 구현 순서는 **작성 당시 스냅샷**입니다. 현재 상태는 아래 P0 원장, 후속 좁은 범위의 승인 결정, 최신 `main` 코드/CI·배포 증거로 별도로 판단합니다. 코드가 존재한다는 사실은 Production 공개 승인과 다릅니다.
- 캐릭터 9명 일반 출시 결정은 [캐릭터 정본](source-authority-decisions/CHARACTER_LAUNCH_MVP_AUTHORITY_V1.md), Reader 초기 **세연 1명 프리뷰**와 유료 Reader 별도 HOLD는 [Reader 단계적 개방](WEB_READER_STAGED_ROLLOUT_SEYEON_FIRST_V1.md) 및 서버 권한이 기준입니다. 이는 상충하는 캐릭터 수 결정이 아닙니다.
- 현재 제품의 공개 Origin과 사용·배포 기준은 [Cloudflare Worker](operations/VERCEL_ORIGIN_DEPENDENCY_CLEANUP_20261026.md)입니다. **2026-10-28 사용자 운영 지시: Vercel은 현재 제품의 사용·신규 배포·장애 시 자동 대체 경로로 사용하지 않습니다.** 과거 [운영 아키텍처](architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md)의 Vercel “현재” 기술과 아직 남아 있는 Vercel 리소스·콜백은 역사적/전환 미완료 상태의 기록이지 현행 사용 승인이 아닙니다. 물리적 종료·OAuth/기존 링크 이관은 별도 운영 수락 조건을 건너뛰어 실행하지 않습니다. 별도 Saju 엔진 및 Supabase Auth/Storage도 Cloudflare로 자동 이전되지 않습니다. Cloudflare 무료 플랜 외 신규 유료 인프라는 미승인입니다.
- 일반 회원 사주 통합은 [기존 권한 재사용 V2](SAJU_BRIDGE_EXISTING_AUTHORITIES_NO_NEW_ROLES_V2_20261016.md)를 따릅니다. 과거 S3A Permit과 SO-4의 3DB 고격리 리허설은 다른 보안/실행 프로파일이며 일반 사주 제품의 공통 선행 조건이 아닙니다.
- 결제는 [P0 결정 원장](P0_DECISION_REGISTER.md)의 Web one-off·PortOne V2를 따르되 판매 Offer/Entitlement 공개는 별도 HOLD입니다. [DR 최신 상태](operations/POSTGRES_DR_READINESS_STATUS_V1.md)의 10월 한정 성공은 9월 `1310` 증거를 현재 상태로 만들지 않으며, `dr_ready=false`와 Hosted Auth/Storage 복구 보류를 유지합니다. DR 검사기 변경은 운영·DR 트랙만 담당합니다.



일반 `security` 트랙은 [Security 실행 로드맵](security/SECURITY_EXECUTION_ROADMAP_V1.md)에서 진행합니다. 구현 90 / 검증 10을 작업 배분 기준으로 적용하며, API 남용 방지·보안 이벤트·공급망·운영 복구 증거를 기존 이슈와 연결합니다. 인증·권한·DB·운영 변경의 개별 승인 경계는 유지합니다.

## 공식 Reader 유료 해설 개인정보 정책 정본 (2026-10-19)

**`P0-PR-02` [개인정보 처리 제품 책임자 결정](OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md)**을 이 기본 브랜치에서 확인합니다. 보호 본문 별도 저장, 유료 권한 소멸 시 새 서버 조회·AI 주입 즉시 차단, 본 DB 24시간 삭제 내부 목표, 일반 로그 90일 상한, 기존 Commerce P5Y·백업 P30D는 유지. 제품 정책은 승인됐으나 신규 테이블·법무·복원 인수·원문 영속 저장·운영 공개는 별도 HOLD입니다. **PR 댓글이나 대화 기억 대신 이 정본과 [P0 결정 원장](P0_DECISION_REGISTER.md)을 참조합니다.**

## 1. 목적

관리자 운영에 한정된 2026-10-27 사용자 확정값(분석 180일·감사 365일·크레딧 매회 확인·AI 월 10만원 경고·이중 Owner 인증)은 [Admin 운영 정책](operations/ADMIN_OPERATING_POLICY_20261027_V1.md)을 따릅니다. Commerce 법정 증빙·일반 로그·백업 보존과 운영 실행 승인 경계는 변경하지 않습니다.

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
OPEN-P0: P0-AI-01
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
