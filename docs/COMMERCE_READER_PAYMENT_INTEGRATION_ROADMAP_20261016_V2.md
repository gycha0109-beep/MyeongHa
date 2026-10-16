# 명하 상품·결제 × Official Reader 통합 실행 로드맵 v2

> **2026-10-16 KST 스냅샷 · Track: `commerce` · 상태: 개발 계속 / SALE OFF / PAID READER PUBLIC OFF / LIVE ACL CUTOVER HOLD**
>
> 작성 기준 MyeongHa `main`: `6062755fb840480c8486741175db06303ba08b55`. 본 문서는 기존 결제·Reader·DB 로드맵의 **2026-10-16 진행상황 인덱스와 다음 실행 순서**다. 이미 승인된 제품/데이터/법무/보안 결정을 변경하거나 새로운 운영 승인을 발급하지 않는다. PR 상태는 조회 시점 스냅샷이므로 실제 작업 직전 최신 GitHub HEAD·base·CI·배포 증거를 다시 확인한다.

## 0. 읽는 법 / 권한 우선순위

- **구현 완료(main)**: 병합되어 있는 코드/정책. 구현 존재만으로 판매·실행 허가는 아님.
- **격리 검증된 Draft**: 별도 PR 코드 및 제한된 시험 결과. **main에 병합된 기능도 운영에 적용된 권한도 아님.**
- **OPEN / HOLD**: 정책·실행·실운영 증거 부족. 완료로 표시하지 않는다.
- 판단 우선순위: `docs/P0_DECISION_REGISTER.md` / 해당 승인 문서 → 현재 `main` 실제 구현 → PR의 정확한 브랜치/HEAD 증거 → 본 통합 인덱스. 이전 시점 설계 문서의 '현재 상태' 문구는 역사 기록이다.
- 원본 로드맵: `docs/COMMERCE_PAYMENT_TRACK_ARCHITECTURE_V1.md` (2026-09-16 결제 아키텍처), `docs/architecture/OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md` (S0–S8), `docs/architecture/READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP.md` (RR-01~15).
- 공식 상품 권위: `docs/STANDARD_LOVE_RELATIONSHIP_PRODUCT_V1.md`, `docs/MOBILE_READER_PRODUCT_OWNER_DECISION_20261012_V1.md`. 이 문서의 단계 재배치는 위 파일의 범위·보호 조건을 폐기하지 않는다.

## 1. 핵심 제품 경계 (변경 금지)

1. 첫 유료 **Product = `standard.love_relationship` (연애·관계 Standard Reading)**; Product Owner 결정 **KRW 8,900**은 *정가*다. 판매 가능한 Offer/Charge Terms가 없어 **실제 청구·결제·발급 활성화는 불허**. 추가 Reader 해설의 별도 가격도 미확정.
2. 웹 단건 구매 + **PortOne V2**. 브라우저 성공 표시/redirect/webhook 자체는 결제 최종 진실이 아니다. 서버가 provider payment를 검증한 evidence만 Commerce 입력이 된다.
3. Product는 '무엇을 해석하나', Reader는 '누가 승인된 관점으로 설명하나'다. **하나의 Reader 독립 Official Reading Source Truth**에 Reader별 해설/구매권이 연결된다. 추가 Reader 구매는 새 사주 원본 생성을 허가하지 않는다.
4. **회원 × 캐릭터 일반 채팅방은 하나**. 사용자가 사주를 선택한 UI/Thread/옛 결속/구매 결과 replay는 현재 유료 접근권이 아니다.
5. 유료 답변 권한은 **현재 유효한 exact Subject × Official Reading × Reader × purchase-backed Grant × Release/Bundle/Revision/Product**를 서버가 판정한다. 한 Reader 환불이 다른 Reader의 권리를 소급 취소하거나 Official Reading을 삭제하면 안 된다.
6. **T1 짧은 사전 검사 → 장시간 DB lock 없는 비공개 생성 → T2 새로운 거래에서 fresh 검증·원자 저장 COMMIT → 사용자 공개**. 검증 전 stream/preview fallback으로 유료 본문 공개 금지.
7. 환불/회수 뒤 신규 유료 생성, 서버 재열람, 일반 Chat history/요약/검색/기억 재주입 차단. 일반 대화의 비유료 기록은 유지한다. 이미 외부로 전달된 콘텐츠 회수를 약속하지 않는다.
8. **Saju 승인된 원문이 Source Truth**. 캐릭터 LLM/상품 코드가 사주 근거, 명리 의미, 공식 근거 ID를 발명하거나 수정하지 않는다. Character별 Reader 표현은 출처 보존·Semantic/Output Guard를 통과해야 한다.
9. Premium/전문 `can_initiate`와 일반 Standard Reader eligibility는 다르다. 9명/9도메인 합성 테스트는 전원 출판·판매권이 아니다. 승인된 Product policy·Character Unlock·Catalog Release 필요.

## 2. 완료/미완료 현황 매트릭스

| 분야 | 확인된 진척 | 남은 실제 경계 | 판정 |
| --- | --- | --- | --- |
| 상품/가격 | `standard.love_relationship` 비활성 Product, Reader 선택/해설 분리, 첫 구매 정가 KRW 8,900 | 최초·추가 Reader Offer/immutable Charge Terms, 실제 Reader 판매 적격성 | **설계 결정 / 판매 HOLD** |
| 결제 Provider | PortOne V2, Payment Attempt, 서버 검증, verified evidence, replay-safe persistence 기반 | 정확한 Offer 기준 sandbox E2E, merchant/live credentials·webhook·정산 운영 승인 | **기반 구현 / live HOLD** |
| 구매/Grant | Guest/Member 소유, Purchase Intent, source-linked entitlement, Official Reading/Reader 접근 후보 | 상품별 실제 verified Payment→Grant→Reader fulfillment 전 경로 검증 | **기반 구현 / 완전 통합 전** |
| Reader·Chat | 기존 단일 Thread, Preview·Reader runtime, 비공개 handoff / 일부 DB query·provenance 후보 | RR-03/04/09 검증된 원자 저장·후속 조회, Saju 원본, 보호 본문 | **실험/후보 / 공개 OFF** |
| 동시성 | S1 잠금 원시 기능 #1983, 격리 경합 #1984, 유효 Bundle 판정 #1987; Commerce D3 계열 공통 잠금/취소 격리 회귀 | **실제 발급/회수/취소 Writer와 T2가 동등한 lock order에 모두 참여**한 통합 증명, 신규 Grant phantom | **Draft 시험 진전 / 통합 미승인** |
| 취소/환불 보안 | #2118→#2124→#2129→#2137→#2150→#2153; 직접 권한, 앱 관리자 secret fence, Auth 최소권한, definer/role/ACL 회복 시험 | 실제 로그인·Data API·간접 경로, 권한 cutover, 운영 함수 누락, 승인·실거래 검증 | **Draft 시험 통과 / 운영 ACL 미변경** |
| 개인정보·법무 | P0-PR-01 보관/삭제 기본 결정, 내부 withdrawal review 분류, 환불 제품 방향 | 실제 제공 개시 증거, 구매 전 고지/미리보기, 보호 본문 분류/삭제/복원, 법무 승인 | **제품 방향 / 출시 HOLD** |
| Saju·AI | Source-of-truth / Guard 구조와 Reader 표현 경계 | relationship+natal/general production interpretation content authority, public Product Reading, P0-AI-01 최종 권위 | **상품 사용 HOLD** |
| 운영 | 백업/복원/CI 및 incident 복구 가드 기반 | 실제 DB migration/역할/배포 상태별 증거, 관리 접근, Release 승인 | **Production cutover HOLD** |

**중요한 수정:** `#1941`은 GitHub Issue 상태가 **closed**이지만 해당 이슈 본문의 완료물이 *가드된 복구 메커니즘*인 점과 실제 운영 1400~1450 복구·최신 백업-복원 증명 여부를 구분한다. 'Issue 종료 = 운영 DB 복구 완료'로 판정하지 않는다. 운영 상태는 새 읽기 전용 증거로 확인.

## 3. 10월 보안 PR 계보 — 검증을 재구현하지 말 것

| PR | 새로 증명한 범위 | 스냅샷 |
| --- | --- | --- |
| [#2118](https://github.com/gycha0109-beep/MyeongHa/pull/2118) | Commerce/Entitlement 핵심 **7개 테이블** `service_role` 직접 DML 축소에 따른 purchase/cancel 회귀 | Draft, 미병합 |
| [#2124](https://github.com/gycha0109-beep/MyeongHa/pull/2124) | 운영 앱의 DB 관리자 비밀번호 직접 사용 방지 | Draft, 미병합 |
| [#2129](https://github.com/gycha0109-beep/MyeongHa/pull/2129) | Supabase Member Auth verifier의 elevated key 거부 | Draft, 미병합 |
| [#2137](https://github.com/gycha0109-beep/MyeongHa/pull/2137) | SECURITY DEFINER/뷰 등 대체 쓰기 경로 감사 | Draft, 미병합 |
| [#2150](https://github.com/gycha0109-beep/MyeongHa/pull/2150) | 실제 DB 로그인/실행 역할, 함수 EXECUTE, trigger metadata 감사 | Draft, 미병합 |
| [#2153](https://github.com/gycha0109-beep/MyeongHa/pull/2153) | 간접 definer·동적 SQL 감지, ACL snapshot/원복 격리 회귀 | Draft, 미병합; HEAD `54e547fcd80973eb4ed10d5e196f35c2b2cdd7f1` |

- #2153 **정확한 HEAD**의 CI `38846852850`, Web PR `38846852837`, Governance `38846852888` SUCCESS를 GitHub에서 확인. Commerce Work Track SUCCESS는 별도 인수인계 보고에 있으며 운영 Cutover 판정은 아님. PG17 의존성 suite가 이 PR에서 독립 선택·PASS했다고 주장하지 않는다.
- 2026-10-16 운영 PostgreSQL 17.6의 *읽기 전용 카탈로그 스냅샷*에서는 `service_role`의 7개 핵심 테이블 직접 DML이 **7/7 남아 있었다**. `public`에서 `service_role`이 실행 가능한 SECURITY DEFINER 진입점 **0**; `vault` 관리 함수 두 개는 별도 분류. 이는 키 접근·Data API 노출·모든 동적 경로의 안전 증명이 아니다.
- 일부 private cancel 함수 3종은 당시 운영 DB에 **없었다**. Draft SQL의 존재나 로컬 PG 성공을 운영 함수 배포로 취급하지 않는다.
- **절대 하지 말 것:** 이미 검증한 D3e23~D3e29 탐지/rollback 시험의 중복 재구현, Draft를 main에 구현된 것으로 간주, 실제 service_role GRANT/REVOKE, 실제 PortOne 취소, 비밀키 조회/변경, 암묵적 Production 배포.

## 4. 선행 PR 및 충돌 인벤토리

- **DB S0/S1/S2 초반:** [#1983](https://github.com/gycha0109-beep/MyeongHa/pull/1983) → [#1984](https://github.com/gycha0109-beep/MyeongHa/pull/1984) → [#1987](https://github.com/gycha0109-beep/MyeongHa/pull/1987): 2026-10-16 조회 시 전부 Draft/미병합. #2153의 상위 취소 경합 체계와 공통 잠금·함수 명칭·실제 Writer 참여를 **중복 없이 비교**한다.
- **RR-03/04:** [#1960](https://github.com/gycha0109-beep/MyeongHa/pull/1960), [#1974](https://github.com/gycha0109-beep/MyeongHa/pull/1974) Draft/미병합. 비공개 provenance 저장/후속 조회의 *후보*이지 정식 유료 Chat 검증·접근권이 아니다.
- **마이그레이션 충돌:** #1960의 `1720_official_reader_assistant_provenance_storage_v1.sql`과 본선의 `1720_standard_reader_product_scope_read_v1.sql` 번호 충돌. 데이터/출처 내용 임의 폐기 금지; forward-only 별도 번호, 의존/카탈로그/Privacy 재검증 전 병합 금지.
- **정책·기술 이슈:** [#1827](https://github.com/gycha0109-beep/MyeongHa/issues/1827) exact Grant replay/revoke, [#1828](https://github.com/gycha0109-beep/MyeongHa/issues/1828) Standard Reader eligibility, [#1884](https://github.com/gycha0109-beep/MyeongHa/issues/1884) 검증 답변의 provenance writer/anchor. 모두 별도 통합 검증이 필요.
- **Saju 외부 의존:** `gycha0109-beep/Saju` `docs/product/22-production-interpretation-authority-audit.md`는 production interpretation content authority **NO_BUILD/BLOCKED**를 명시한다. 최근 다른 범위의 Saju 코드 발전을 relationship Product 출판 승인으로 추정하지 않는다. 대상 도메인에 대해 최신 reviewer/pack/runtime authority를 직접 재검증해야 한다.
- **Release/운영 증거:** #1941 이슈 종료와 실제 운영 복구, CI 녹색과 실제 배포, Draft의 Test role과 실제 배포 로그인은 반드시 각각 분리.

## 5. 실행 계획 (순서·담당·합격 기준)

### M0 — 최신성/중복/통합 계약 정리 (**즉시**, docs·read-only)

**소유:** Commerce + DB Authority + Reader + Ops.

1. 최신 main/상위 Draft를 pin하고 PR 스택·migration 목록·S0–S8/RR dependency를 대조한다. 이미 통과한 보안 clone suite 재구현 금지.
2. 실제 신규 구매권 **INSERT/발급**, purchase receipt persistence, 복수 Reader bind, refund/revoke, 2-Grant batch cancel, 최종 **T2**의 트랜잭션 진입·잠금 순서·DB 역할·현재 권한 검사 위치를 **한 표**로 기록한다.
3. 각 작업을 `already proven in isolated PR` / `in existing main` / `missing` / `blocked by authority`로 분류하고 #1983~1987과 D3 상위 스택 중 중복 함수/잠금 방안을 하나로 정합화한다.
4. 누락/충돌은 정확한 파일·최소 재현·owner·테스트 기준으로 Issue 또는 작은 Draft PR을 만든다. 통합 중 과거 SQL migration 수정/충돌 숨김 금지.

**Exit:** 공통 잠금/역할/권한 dependency 표, migration 충돌 목록, 유일한 다음 구현 slice 확정; API·PG·Production 변동 0.

### M1 — Commerce 구매권↔취소↔T2 공동 직렬화 증명 (**바로 다음 코드/시험 우선순위**)

**소유:** DB Authority + Commerce (Reader/T2 협업). **기존 격리 test DB/forward-only Draft**.

1. M0에서 확인한 실제 legacy/신규 Writer를 구분한다. 동일 Subject×Official Reading×Reader scope에 신규 Grant **phantom INSERT**와 회수, 환불, bind, T2가 참여하는지 확인. 복수 Scope는 결정적 정렬 순서.
2. S1/S2 및 D2/D3 회귀에서 **이미 통과한 시나리오는 재사용**하고, 빠진 3세션 경합(신규 Grant ↔ cancel ↔ T2), 취소 먼저/발급 먼저, timeout/deadlock/replay/partial failure를 추가한다.
3. T2는 **fresh active exact Grant**와 단일 허용 Bundle 판정을 재검증한다. 0개 DENY, 서로 다른 두 Bundle DENY, 동일 Bundle 다중 Grant 중 하나 revoke 시 유효한 다른 Grant 허용. `replayed=true`/과거 결속이 현재 권한을 생성하지 않는다.
4. 실패/환불 우선 COMMIT에서는 보호 본문·현재 권한·Grant 오염 **0**을 증명. Draft 테스트 PASS와 Production Cutover는 분리.

**Exit:** 실제 PostgreSQL 15/17에서 필요한 2~3 연결 양방향 경합·교착·부분 실패·권한 부정 PASS + 공통 Writer/lock-order evidence. 선택되지 않은 PG17 suite는 PASS로 표시하지 않는다.

### M2 — Saju 원본과 Reader provenance 입구 확정 (**M1과 병행 가능한 준비**)

**소유:** Saju + Reader + Character + DB.

1. 정확한 `relationship / natal / general`의 Saju production 해석 규칙·review/pack·grounding Unit authority 실재 여부 검증; 없으면 **해당 상품 실행 NO_BUILD/HOLD**, 연구/빈 pack/LLM 생성으로 우회 금지.
2. 서버만 출처 Unit·hash·disclosure/ambiguity/companion 및 Semantic/Output Guard PASS를 발급할 수 있게 하는 RR-02/06→RR-03 계약을 pin.
3. Standard Reader eligibility #1828(일반 Standard vs specialist can_initiate), Content Release/Unlock/Bundle 조합을 승인 가능한 시나리오로 고정.

**Exit:** 실제 승인된 원본을 쓰는 positive-path 증거 또는 정확한 blocked dependency 기록. 해석 콘텐츠 권위 없으면 M3의 합성 negative 테스트까지만 허용.

### M3 — 유료 본문 격리 + T1/T2 검증 저장 + RR-04 재조회

**소유:** Reader + DB + Privacy + API. **M1 통과 및 M2 positive authority 필요**(실제 제품 경로); fail-closed 합성 경로는 사전 시험 가능.

1. 현재 `cmd_commit_chat_turn_v1`, Chat messages/attempts, Memory, Search, Summary, Outbox, Logging/Analytics, notification, backup/restore 경로에 **유료 본문이 어디로 복제되는지** 감사한다. 보호본문 새 테이블/retention은 Privacy 승인 전 확정·배포하지 않는다.
2. RR-03 서버발행·검증된 assistant provenance와 protected body, 정확한 Thread/Reading/Reader/Bundle/Release/Grant/Source를 **원자 COMMIT**하고 T2 성공 전에는 비공개. #1960의 기존 비공개 후보와 충돌을 풀어 진행한다.
3. RR-04는 최신 현재 권한과 커밋된 답변만 연결한다. revoked/refunded, 타 사용자/Reading/Reader/Bundle, stale hash/Source, 이전 권한만 있는 replay에는 본문/AI 기억 재주입 **0**.
4. 중복 요청·재전송·네트워크 실패·T1 뒤 취소·T2 직후 취소를 실 PG로 검증. 일반 Thread는 유지; 유료 접근 실패와 일반 메시지 삭제는 구분.

**Exit:** RR-03/04/09/10·S3–S6 안전 검증, 합성 및 실제 승인 소스의 분리, 환불 뒤 유료 노출 0, Privacy 분류/삭제/복원 증거.

### M4 — 유료 상품/PortOne Sandbox 수직 통합

**소유:** Commerce + Product + UX + QA + Legal.

1. 최초 Reading과 추가 Reader 해설을 서로 다른 **Offer role**로 취급한다. 최초 정가 KRW 8,900은 이미 결정되었으나 **추가 Reader 가격/할인**은 PO 별도 권위 필요. 승인 전 Offer 생성·Charge Terms 고정/Checkout 활성화 금지.
2. 승인된 Offer 이후에만 서버가 상품/Reader Eligibility→Purchase Intent immutable snapshot→PortOne sandbox verified evidence→정확한 purchase-backed Grant→Official Reading 재사용/Reader access→T1/T2→안전한 사용자 전달을 검증.
3. 부분/전체 취소·2건 batch·Chargeback/Replay·Guest→Member·다른 Reader 남은 권리·전달 실패를 포함한다.
4. 결제 전 법정 고지/미리보기, 취소 접수 가능성, **실제 제공 개시**의 독립 서버 증거, 가분적 미제공 부분 및 법정 환불 예외를 계약으로 승인한다. 내부 DB COMMIT/결제/생성 시작만으로 디지털 콘텐츠 제공 개시를 단정하지 않는다.

**Exit:** 정확한 출시 Product/Offer 기준 sandbox end-to-end PASS + 법무/개인정보 계약·전달 증거 + kill switch. Test PASS로 실거래 활성화 금지.

### M5 — 운영 보안 Cutover·출시 Gate (**별도 승인 이후만**)

**소유:** Security + Commerce + DB + Ops/Release + Legal/Privacy.

1. 실제 배포 API/Worker/admin `session_user`·effective role·`SET ROLE`, 배포 설정/비밀관리(값 읽기 없이), Data API exposed schema, 함수/trigger 간접 진입, `vault` 운영 관리면과 외부 관리계정 경로를 재확인한다.
2. 운영 7테이블 `service_role` 직접 DML, 누락된 private cancel 함수, 실제 배포 migration/history, 계정 rollback, 비상 중단, 백업·복원 연동을 **실제 운영 변경 없이** 사전 승인 패키지로 제시한다.
3. Commerce/DB/Security/Legal/Privacy/Release 소유자별 승인·rollback·계정 통제 없이는 운영 `REVOKE/GRANT`, Production migration, 실결제/환불, 공개 Reader Chat **불가**.
4. 승인 후에도 기능 OFF → 제한된 내부 검증 → 점진 공개 → 정확한 Production SHA와 기능·권한·rollback 관측 순서로 진행한다.

**Exit:** 별도 owner 승인, 실배포 증거, 이상 시 자동 차단 및 복구 책임, Reader RR-13~15와 S7/S8 수락. **현 시점 미충족**.

## 6. 이전 S0~S8 및 RR 실행표 매핑

| 기존 로드맵 | v2에서의 위치 | 2026-10-16 처리 |
| --- | --- | --- |
| S0 설계 | M0 | 기존 계약 보존, 최신 보안 PR을 반영하여 dependency 갱신 |
| S1 공통 범위 잠금 | M0→M1 | #1983 Draft 검증, 실제 운영/합병 아님 |
| S2 발급·취소·T2 공통 Writer | **M1** | D3 격리 작업 상당히 축적; T2 및 실제 Writer 통합 최종 증명은 미완료 |
| S3 공식 사주 근거 | M2 | Source Truth/승인 해석 없으면 제품 실행 BLOCK |
| S4 유료 본문 격리 | M3 | Privacy + Chat leak-surface 감사 후 구현 |
| S5 최종 원자 저장 | M3 | RR-03/09, #1960의 후보와 정확한 결속 |
| S6 최종 재조회 | M3 | RR-04/10, #1974 후보를 최신 권한으로 검증 |
| S7 화면·실제 제공 | M4 | 동일 Thread + PortOne sandbox + 법무 제공 개시 |
| S8 출시 | M5 | Owner Cutover/Prod 복구/Release 별도 승인 |
| RR-01~RR-15 | M2~M5 | 기존 `READER_RUNTIME_V2_TRACK_CLOSEOUT_ROADMAP`를 세부 Reader 기준으로 유지 |

## 7. 지금 바로 진행할 1개 작업 카드

**M0-01 — purchase / cancel / Reader T2 현재 Writer-lock-role 인벤토리 및 누락 경합 도출**

- **읽을 것:** 최신 main + #1983/#1984/#1987 + #2118/#2124/#2129/#2137/#2150/#2153 + #1960/#1974, `#1827`/`#1828`/`#1884`, migration 1720 충돌 및 1740~1960 Draft.
- **납품:** (A) 실제 함수/TS entrypoint별 `DB login → SET ROLE → owned writer → lock scope/order → current Grant check → commit/reveal` 표, (B) 기존 격리 testcase → 신규 T2/Grant phantom 갭 표, (C) 충돌/선행 gating 소유자, (D) 최소 새 시험의 정확한 파일/명령/예상 결과.
- **절대 재구현하지 않을 것:** #2153의 간접 definer/ACL snapshot·rollback 회귀 및 #2118 기반 7테이블 권한 거부 테스트.
- **성공 판정:** 사용자에게 바로 검토 가능한 갭과 다음 **단일 작은 Draft** 범위가 나오고, 운영 DB·기존 PR 변경·실결제·병합은 0건. 다음에 M1의 실제 누락 경합부터 구현한다.

> **M0-01 인벤토리 작성 (2026-10-16, 자식 Draft):** [Writer/잠금/역할·T2 미완료 경계 조사](./architecture/COMMERCE_READER_M0_WRITER_LOCK_ROLE_INVENTORY_20261016_V1.md). 다음에는 M1-01 실제 결제 완료→Reader 구매권 발급 caller/role의 최소 격리 검증으로 이동합니다. 본 문서화는 유료 공개·운영 ACL 변경의 승인이 아닙니다.

## 8. 각 단계의 검증·작업 운영 규칙

- 일할 때마다 exact main/target PR HEAD·base·Draft/merged·selected CI(특히 PostgreSQL 15/17)·실배포 여부를 다시 확인한다. CI 성공은 정확한 SHA에만 귀속한다.
- **분리 원칙:** Commerce 검증 PR은 `Watchtower-Track: commerce`, DB Owner 작업은 `db-authority-core`, Reader는 `reader-runtime`. 하나의 PR을 여러 트랙 완료로 포장하지 않는다. 새 workflow 누적 대신 기존 suite 재사용.
- 기존 stacked Draft는 소유자와 검토 없이 force push/rebase/merge하지 않는다. 실패 시 문서에 **시점·SHA·실행 환경·재현성·안전 영향**을 남긴다.
- 보안상 개발 가능한 로컬/CI synthetic 검증과 운영 Cutover 승인 사이에 **명확한 HOLD**를 둔다. Product·Saju·AI·Legal 미결정인 부분은 synthetic fixture로 통과해도 활성화하지 않는다.
- 상태 보고 형식은 항상 짧게 **완료 / 문제 / 다음 작업**을 기본으로 한다.

**한 줄 결론:** 새로운 Commerce 보안 기초를 반복하지 않는다. **M0 Writer/lock/role 인벤토리 → M1 새 Grant·취소·T2 통합 경합 → M2 Saju 권위/Reader 적격성 → M3 비공개 원자 공개·재조회 → M4 Sandbox 구매 전체 흐름 → M5 운영 Cutover/출시** 순서로 진행한다.
