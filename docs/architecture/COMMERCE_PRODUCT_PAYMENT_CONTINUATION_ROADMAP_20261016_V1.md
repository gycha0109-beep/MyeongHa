# 명하 상품·결제 트랙 — 2026-10-16 재개 로드맵 v1

> Track Key: `commerce` (`Watchtower-Track: commerce`)
> Status: **EVIDENCE-BASED HANDOFF / ROADMAP DRAFT / NO PRODUCTION AUTHORIZATION**
> GitHub `main` 확인 SHA: `929c304813aac60b30a528183835ea2e8b774cd8` (2026-10-16 조회)
> 별도 보안 Draft 최종 PR: #2153 HEAD `54e547fcd80973eb4ed10d5e196f35c2b2cdd7f1`
> 새 정책·가격·구매권·출시 승인: **이 문서가 결정하지 않음**
> 금지: PR 자동 병합, 운영 ACL/DB 변경, 결제·환불 실행, 비밀값 조회, 공개 유료 Reader/T2 활성화

이 문서는 2026-09-16의 `docs/COMMERCE_PAYMENT_TRACK_ARCHITECTURE_V1.md` 및
`docs/COMMERCE_ENTITLEMENT_SPEC.md`를 **대체하지 않는 후속 상태/작업 지도**다.
해당 문서들의 오래된 `#844` frontier, `P0-PR-01 OPEN` 또는
첫 Product 미정처럼 보이는 항목은 2026-10-16 현재의 최신 증거로 재판정한다.
정책의 최종 우선순위는 `docs/P0_DECISION_REGISTER.md`, 개별 결정문, 최신 병합 상태,
정확한 PR HEAD/CI, Owner 승인에 따른다.

## 1. 이번 재개에서 직접 확인한 사실

| 항목 | 최신 직접 확인 / 출처 | 의미 |
| --- | --- | --- |
| 기준 `main` | `929c304813aac60b30a528183835ea2e8b774cd8` | 본선 스냅샷이지 Draft Stack 병합 증명이 아님 |
| Security #2118 | Draft/open/unmerged HEAD `a7fd45f` | 7개 테이블 service_role DML 격리 시뮬레이션 |
| Security #2124 | Draft/open/unmerged HEAD `0a452d8` | Production 앱의 DB 관리자 암호 사용 금지 검사 |
| Security #2129 | Draft/open/unmerged HEAD `b2f15ec` | 회원 Auth verifier용 과권한 Supabase API key 거부 |
| Security #2137 | Draft/open/unmerged HEAD `241e48d` | definer·view 대체 쓰기면 감사 |
| Security #2150 | Draft/open/unmerged HEAD `d907f3f` | 실제 실행 역할·함수 EXECUTE·트리거·권한 감사 |
| Security #2153 | Draft/open/unmerged HEAD `54e547f` | 간접/dynamic SQL definer 감지·7-table ACL 복구 검증 |
| #2153 HEAD CI | CI #38846852850, Governance #38846852888, Web PR #38846852837 SUCCESS | CI Verify / Work Track commerce / db-authority-core SUCCESS. `postgres17` dependency **SKIPPED**, 별도 PASS 아님 |
| Character #1232 | Open, unmerged; 별도 Character Bible 연구 PR | 이전 채팅의 Character Kernel/Context 실험. Commerce activation 근거 아님 |

보안 여섯 PR은 **연속된 Stacked Draft**다. 각자의 `base`가 앞 PR 브랜치이므로
각 PR의 diff를 모두 독립적인 `main` 변경으로 세거나 별도 병합된 기능으로 누적하지 않는다.
#2153 HEAD가 성공해도 선행 PR의 운영 적용/병합을 뜻하지 않는다.

## 2. 전체 Product → Payment → Rights → Reader 현재 위치

| 축 | 이미 존재하는 근거/설계 | 현재 경계 | 향후 담당 |
| --- | --- | --- | --- |
| Launch Rail | Web 1회성 + PortOne V2, server lookup 권위 | PSP **선정**, live merchant/checkout **OFF** | Commerce/Release |
| 첫 Standard Product | `standard.love_relationship` (Topic=연애·관계) | 상품 정의 및 8,900원 **표시가격 결정**. Saleable Offer/immutable Charge Terms **미활성** | Product/Commerce |
| 과거 상품 후보 | `saju.general_natal.deep.v1` / 9,900원 | historical superseded. 재활성화 금지 | Product |
| Reader 지정 | 공식 Reader는 Product와 분리된 purchase provenance | 1회 구매 = 모든 Reader 구매권이 아님. 정확한 Reader Grant 필요 | Product/DB/Reader |
| 초기 vs 추가 Reader 구매 | `standard_reading_offer_roles` + CAP-B2 Draft 스택 | initial Reading 생성 / additional Reader 해설 재사용 분리 후보. **판매 활성화 아님** | Product/DB |
| Purchase/verification | Purchase Intent, PortOne server verification, verified evidence/persistence foundation | 브라우저 성공/웹훅 신호만으로 결제나 Entitlement를 확정하지 않음 | Commerce |
| Entitlement | 구매별 Grant, append-only ledger, effective aggregate/recompute | 검증된 실제 결제→권한 발급→회수의 운영 전체 사이클은 미활성/미통합 | Commerce/DB |
| Provider cancellation | #2034~#2153의 private refund/cancel/security Draft 계보 | 합성 full-cancel·2-Grant 원자성/ACL 시험 진척. **실제 PortOne cancellation ingress 및 운영 revoke 아님** | Commerce/DB/Security |
| 공식 Reading | Reader-independent 공식 원본 1개 + Reader별 해설·권한 | 구매·범위 pin·결속·환불 race의 B2-R0~R7 Draft 검증 중 | Product/DB/Reader |
| 유료 Reader Chat | 일반 회원×Character 채팅방 1개; T1→비공개 생성→T2 현행권한/출처 재검증→공개 | S0~S8 중 공동 잠금·출처·보호 본문·후속 조회·실제 인도 증빙 **미완료** | Reader/DB/Privacy |
| Character 연동 | Character 표현은 공식 Saju/Reading 의미를 바꾸지 않음 | Character Bible #1232는 연구 분기; Production 적격성/유료 권한 자체는 아님 | Character/Reader |
| 디지털 콘텐츠 환불/고지 | 내부 순수 withdrawal review + 사전 고지/실제 인도 구분 | 자동 환불거부 불가; Legal 고지/배송 증거/권한 분리가 남음 | Legal/Commerce/Privacy |
| Production 복구/보안 | 사전 DR, 기존 migration 1400~1450 이력, RLS/ACL/최소권한 기준 | DR #1941, Owner 승인, 운영 역할·Data API·간접 경로 검증 전 **HOLD** | DB/Security/Ops |

`docs/P0_DECISION_REGISTER.md`의 `P0-PR-01`은 현재 **DECIDED**다.
기존 개인정보 삭제·익명화·Commerce evidence P5Y / backup P30D 기준은 승인된 범위에서 유지한다.
다만 **새 R1/1840 관련 Privacy FK graph/삭제·복원 확장 승인**은 별개이고,
CAP-B2 격리 Draft의 Governance 실패를 무시해서는 안 된다.

## 3. 2026-10-16 Commerce 보안 트랙 재합류 판정

### 이미 증명한 범위 — 중복 개발 금지

- `service_role`의 7개 보호 테이블 DML이 **실제 운영 DB 메타데이터에서 남아 있음**을 읽기 전용 조사.
- disposable PostgreSQL에서 7 × INSERT/UPDATE/DELETE 권한 거부, 기존 purchase/검토된 cancel/2-Grant cancel 합성 회귀 유지.
- 일반 앱 실행 principal과 별도 worker 역할, Auth API 키 최소권한 검사·관리자 DB 암호 차단.
- `public` 실행 가능한 SECURITY DEFINER 직접/간접 경로를 분리 감사; synthetic indirect helper/dynamic SQL 2개 탐지와 SQL ACL rollback/snapshot 시험.
- 정확한 HEAD의 CI/Work Track/DB Authority Core 결과는 성공. PG17 *추가 dependency*는 이 HEAD에서 skipped.

이 결과는 **운영 DB 권한 변경, 운영 접속 identity, Data API exposure, PortOne 실제 취소, Legal 승인, Production release**의 증거가 아니다.

### 여전히 미입증 / 미적용

1. Vercel/API/Worker/Admin의 실제 배포 DB 로그인·실행 principal 및 관리자 credential 접근 이력의 독립 증빙.
2. PostgREST/Data API exposed schemas 및 RPC 직접·간접 접근의 최종 조사.
3. 직접 문자열 참조가 없는 동적 SQL/간접 함수/trigger 전체 호출 그래프의 운영 완전성.
4. 필수 private cancel 함수가 운영 DB에 빠져 있는 상태와, 기존 실제 발급/restore/revoke Writer의 정확한 의존성.
5. 신규 Grant 생성 ↔ 검증 취소/회수의 교차 경합, 정렬 잠금, 실패 롤백, 재시도, outbox/worker의 실제 호출 증거.
6. 운영 ACL 축소의 배포·관측·복원 순서와 Owner 동의.
7. Commerce/Legal/Privacy/DB/Security/Ops/Release의 별도 운영 Cutover 승인.

**현재 Supabase DB에 어떠한 ACL 변경도 하지 않는다.**

## 4. 기존 로드맵과 교차 의존성

### Official Reader 상위 로드맵

`docs/architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md`
의 S0~S8은 그대로 유효하다.

- S1/S2: 상품·Reader scope-first lock. “기본 잠금 시험 PASS”와 “모든 실제 Writer가 참여함”을 분리.
- S3/S4: Saju 소유 근거의 긍정 검증 + 유료 원문 격리. Security ACL 성공으로 대신할 수 없음.
- S5/S6: T2 원자 저장과 권한 재검증·후속 조회. refund 이후 이전 답변 유출 금지.
- S7/S8: 사용자 실제 제공 증거, 법무/Privacy/DR/출시 승인이 필요.

### CAP-B2 하위 로드맵

Draft #2026의 `CAP_B2_STANDARD_READER_EXECUTION_ROADMAP_V1.md`는
B2-R0~R7 (scope pin→결속 전 환불→전 Writer 공통잠금→BIND-01~29→T1/T2→Owner/DR→출시)을 구체화한다.
#2041은 일부 BIND-13/19 합성 PostgreSQL 검증을 갖춘 Draft이지 전체 매트릭스 PASS가 아니다.
신규 Commerce 작업은 이 소유 트랙에서 이미 구현한 SQL fixture를 복제하지 않는다.

특히 운영 Caller가 공통 scope lock에 참여하지 않는 한,
**Security ACL 격리 성공과 정합성 있는 실결제 환불은 독립적인 미완료**다.

## 5. 남은 Commerce 작업 — 실행 우선순위

| 순서 | 작업 | 지금 가능한 안전 범위 | 종료 근거 / HOLD |
| --- | --- | --- | --- |
| **C0 — DONE** | 보안 6개 PR/HEAD 검증 및 기존 로드맵 재동기화 | 이 문서 / 정확한 CI와 Draft 계보 정리 | 완료는 **재조회 스냅샷**. 운영 권한·출시 미승인 |
| **C1 — NEXT** | **Commerce 호출·권위 매트릭스 정리**: verified purchase → exact Receipt/Grant → initial/additional Reader bind → refund/cancel → effective access → paid T1/T2 각 단계가 쓰는 현재 DB/API entrypoint, 실제 Reader/Commerce Owner, 잠금·EXECUTE·retry 증거를 1:1 연결 | **코드+합성 테스트만 읽기**, 기존 #2034~#2153 및 B2-R3/4 fixture 재활용. 빠진 positive/negative *테스트만* 좁게 추가 | 빈 호출 경로 / 실제 운영 미연결을 명시; 새로운 운영 source 사실이나 정책을 가정하지 않음 |
| **C2** | 신규 Grant 발급↔취소·복원 교차경합의 Commerce-owned 잔여 케이스 | 기존 B2/DB Owner 스택과 중복 확인 후 *없는 interleaving만* disposable PG15/17에 추가 | lock-order·event lineage·row ACL·replay·rollback 증명. Production 실행은 HOLD |
| **C3** | Provider cancellation observation→independent GET→trusted source classification→private refund/revoke handoff의 end-to-end dry run | PortOne synthetic/isolated transport evidence; 기존 #2057~#2153 중복 제거 | 실제 PG 환불/Chargeback 정책·운영 activation까지 포함했다고 주장하지 않음 |
| **C4** | Security·Ops 운영 Cutover 준비: 실제 호출자 identity, Data API, 관리 경로, DB 역할, 회수·복구 순서 | read-only inventory + 합성 ACL rollback, 민감정보 비노출 | DB/Security/Commerce/Legal/Privacy/Ops/Release 승인과 DR 및 실제 Vercel config 증명까지 HOLD |
| **C5** | 최초/추가 Reader Offer/가격/고지/결제·Entitlement 정식 결속 | Product/Legal/Reader Owner authority 확정 뒤 새 승인 범위만 구현 | 표시가격 8,900원은 charge authority 아님; 추가 Reader 가격 임의 seed 금지 |
| **C6 — HOLD** | PortOne Sandbox E2E, 실제 유료 판매·환불, 공개 Reader T2, 운영 배포 | Product·Saju·Privacy·Legal·DR·Security/Commerce 승인 후 별도 단계 | 승인 전에는 public/paid/ACL/Grant mutation 전부 OFF |

## 6. C1 첫 작업 정의 — 코드 수준 권위/호출 경로 인벤토리

이 문서 다음의 실제 개발 작업은 **보안 검사를 다시 만드는 것이 아니라 Product/Commerce/Reader end-to-end 호출 그래프의 '빈 구간'을 찾는 것**이다.

처음 확인할 출발점:

- `apps/api/src/commerce-provider-payment-completion-orchestration.ts`
- `apps/api/src/commerce-verified-payment-evidence-persistence.ts`
- `apps/api/src/entitlement-effect.ts`, `entitlement-restore-command.ts`
- `apps/api/src/official-reading-reader-admission-v1.ts`
- `apps/api/src/standard-reading-reader-product-policy-gate-v1.ts`
- `apps/api/src/commerce-digital-reading-withdrawal-review-v1.ts`

Draft 소유 구현은 **PR 브랜치에서만** 확인:

- #2014 / #2029 / #2032 / #2035 / #2041 — initial/additional/scope/lock/Reader.
- #2034 / #2037 / #2057~#2153 — cancellation/verified event/ACL/운영 safety.
- #1960 / #1974 — RR-03/04 분리 출처·조회. 기존 1720 migration 번호 충돌과 Privacy ownership 감안.

C1 산출물:

1. `MAIN / DRAFT-ONLY / NOT IMPLEMENTED / LIVE UNVERIFIED` 네 상태를 각 호출 entrypoint에 부여.
2. 입력·출처·트랜잭션 잠금·DB 실행 Role/EXECUTE·실패 시 mutation·성공 시 유료 공개 여부를 분리 기록.
3. 구매 후 취소/회수·재구매·다중 Grant·초기 결속 전 취소의 **이미 있는** SQL/Unit 증거를 연결.
4. **정말 빠진 1개 테스트만** 다음 코드 Slice로 제안한다. 제품 semantics/권한/가격 발명 금지.
5. C1 문서와 이후 테스트를 `Watchtower-Track: commerce`인 별도 Draft로 관리한다. 다른 트랙의 stacked PR을 재작성/병합하지 않는다.

## 7. 이전 Character 채팅 개발 지점과 연결

이 채팅의 마지막 Character 작업은 #1232 세연 Bible/Context 연구였으며,
상위 작가-facing Kernel을 작은 런타임 context로 컴파일하는 방향을 검증했다.
이는 **Commerce 결제 권한의 생성자도, 공식 Saju source도, 유료 Reading 구매권도 아니다.**

후속 연동점은 Character Runtime을 조작하는 것이 아니라, **유료 Reader 접근을 허용한 API의
정확한 Reader/Official Reading/Grant/Content Bundle provenance가 Character Renderer까지
권한 분리된 상태로 전달되는지** 확인하는 것이다.

Character Kernel 9인 설계는 별도 소유 작업으로 유지한다. 타 채팅의 Character 변경사항이
이 문서나 보안 PR 때문에 자동 승인·정식 발행된 것으로 취급하지 않는다.

## 8. Merge / Cutover 금지 및 다음 판정

- 본 문서 PR은 **문서만** 변경하고 `main`에 자동 병합하지 않는다.
- Security 6개 Stacked Draft는 그대로 HOLD하고 PR base/head를 임의 변경하지 않는다.
- `postgres17` skipped 상태는 PASS가 아니다.
- real money movement / refunds / entitlements / Production ACL / Vercel secret / deployed runtime을 변경하지 않는다.
- 보안 하위 테스트 추가를 위한 무한 hardening을 하지 않는다; C1 호출 공백이 확인되면 상품·결제 기능 흐름 중심으로 우선순위를 돌린다.

**다음 작업:** C1 호출 경로/권위 매트릭스(재검증 포함) → 빈 1개 regression을 좁게 구현
→ 현재 HEAD CI → 원래 Product/Commerce integration 우선순위로 복귀.
