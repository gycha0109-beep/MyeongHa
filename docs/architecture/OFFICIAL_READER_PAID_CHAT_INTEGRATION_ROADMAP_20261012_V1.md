# 명하 공식 사주 해설 × 단일 일반 채팅방 — 단계별 구현 로드맵 v1

- 기준: 2026-10-12 제품 결정 `docs/MOBILE_READER_PRODUCT_OWNER_DECISION_20261012_V1.md`.
- 작업 분류: `db-authority-core`; 관련 Reader RR-03/04/09, 결제·권한 경합 #1827, 출처 저장 #1884, 운영 복구 #1941.
- 상태: **설계·비공개 검증 진행 / 유료 해설 공개 금지 / 결제 개시 금지 / 운영 DB 변경 금지**.
- 이 문서는 기술 구현 순서와 검증 계약이다. 제품 방향 승인과 DB·Commerce·Reader·개인정보·법무·출시 승인 간 차이를 지우지 않는다.
- 진행 보고: **완료 / 문제 / 다음 작업**. 각 단계에서 실제 수정 경로·검증 대상·미해결 차단을 기록한다.

## 1. 변경할 수 없는 제품 경계

1. 일반 대화는 **정식 회원 × 캐릭터당 하나의 채팅방**을 유지한다. 유료 사주마다 새 일반 채팅방을 임의로 만들지 않는다.
2. 유료 해설의 권리는 **공식 사주 결과 × 해설 캐릭터 × 검증된 독립 구매권**에 속한다. 채팅방/화면 선택/과거 결속 재생은 권리가 아니다.
3. 동일한 사주·캐릭터·묶음에 독립 유효 구매권이 여러 개 있으면 하나가 유효할 때 허용 후보; 다른 묶음이 동시에 유효하면 어느 묶음도 임의 선택하지 않고 거절한다.
4. 환불·권한 회수·만료 이후 새 유료 생성·서버 재열람·AI 기억 재주입을 차단한다. 이미 수령한 외부 본문을 사후 회수할 수 있다고 약속하지 않는다.
5. 사전 짧은 권한 확인 → **연결·잠금 없는 비공개 생성** → 별도 DB 거래에서 현재 권한 재확인·저장 확정 → 성공 후 사용자에게 공개. 부분 출력과 조기 전송은 금지.
6. 공식 사주 계산·해석의 출처는 Saju 소유이고, 캐릭터 표현은 명리 의미를 변경하지 못한다. AI·사용자 작성 출처 식별자만으로 공식 근거를 인정하지 않는다.
7. 기존 세연 일반 Chat, 구매·결제 책임, 기존 0220/1130/1150/1220/1270 migration을 직접 변조하지 않는다. 필요한 변경은 새 순방향 migration·분리된 변경 요청으로 작성한다.
8. 신규 개인정보 보관 테이블의 추가·삭제·보존 규칙은 Privacy Owner의 별도 분류/복구 증거가 필요하다. 기존 RR-03 승인 건수를 임의 수정하지 않는다.

## 2. 호출 및 보관 구조

```text
일반 회원×캐릭터 채팅방 (단일)
    │ 공식 사주 선택은 단지 요청 범위
    ▼
서버의 현재 회원·구매권·Product/Reader/Release 검증(T1)
    ▼
Saju 공식 원본 → Saju 소유 근거 Unit 및 주의·불확실성 보존
    ▼
Character 안전 표현 → 의미 보존 검증 → 최종 출력 검증
    │ 이 구간에서는 긴 DB 잠금 없음. 본문 공개 없음.
    ▼
새 거래(T2): 공통 범위 잠금 → 현재 Subject/Grant/Reading/Reader/
             Product/Release/Bundle/Revision/출처 재검증
    ├─ 불일치: 원자 롤백, 본문 공개 없음
    └─ 일치: 검증된 답변·출처·시도·메시지의 일관된 확정
                   │
                   ▼
      일반 대화 표시 계층 ↔ 별도 보호된 유료 본문(제안, 미승인)
                   │ 현재 권한으로만 서버 결합
                   ▼
    후속 질문: 마지막 유효 근거 조회 → 원본 재확인 → T2 반복
```

**보호 본문 분리안은 새 설계 제안이지 현재 승인·구현된 테이블이 아니다.** 현행 `cmd_commit_chat_turn_v1`이 일반 메시지 본문에 쓰는 경로와, 생성 시도·기억·검색·요약·알림·감사 기록까지 함께 감사해야 한다. 단순히 RR-03 출처 행을 기존 일반 메시지에 추가하는 것으로 유료 정보 격리를 달성했다고 주장하지 않는다.

## 3. 단계와 납품 조건

| 단계 | 구현·검증 범위 | 선행 조건 | 완료 증거 |
| --- | --- | --- | --- |
| **S0 로드맵 확정** | 제품·DB·Reader·Commerce·Privacy 경계, 실패 시 차단, 시행 순서 | 현행 코드·정책 | 저장소 문서와 변경 요청 |
| **S1 공통 잠금 원시 기능** | 회원×공식 Reading×Reader에 대한 거래 범위 비공개 잠금 함수; PostgreSQL 실제 접속 경합 시험; 권한 비공개 | S0 | 같은 범위 대기·다른 범위 독립·잘못된 회원 차단·권한 검사, PG15/17 |
| **S2 결제/환불/결속 공동 잠금 계약** | 검증된 영수증의 Grant 발급, Reader 접근 결속, Grant 회수·환불·최종 T2가 모두 같은 순서로 잠금. 복수 사주를 건드리는 작업은 범위 정렬 | S1; DB·Commerce 기술 검토 | 신규 Grant 삽입과 회수 경합의 양방향 실제 DB 시험, 교착·시간 초과·세션 소유 검증 |
| **S3 공식 출처 증명** | 실제 Saju 소유 근거 목록·해시·선택/동반/공시/모호성 연결과 Semantic·Output 검증 결과를 서버에서만 발급 | RR-02/06 및 Saju 소유 계약 | 위조·다른 Reading·누락·변조·중복 근거 0건 수락 |
| **S4 유료 본문 격리** | 같은 일반 채팅방을 유지하며 보호 본문·안전 표시를 구분, 기억·검색·요약·알림·생성 임시 저장을 포함한 유출 표면 제거 | Privacy 삭제·복원 분류, 기존 Chat 소유 검토 | 환불 후 일반 기록 유지·유료 원문 표시 및 AI 재주입 0 |
| **S5 RR-03 원자 저장** | 최종 T2 잠금, 원본·제품·출처 및 버전 재검증, 검증된 정확한 답변/출처/시도를 하나의 거래로 확정; 재시도 원본 일치 | S2~S4 | 일부 확정 0, 시도 재생 안전, 2연결 경합·실패 롤백 |
| **S6 RR-04 후속 조회** | 현재 권한 재검증, 보호 본문과 최신 검증 메시지의 정확한 결속, 출처 기반 후속 근거; 과거 유효 답변 임의 대체 금지 | S5 | 실 PostgreSQL 긍정·권한 상실·출처 불일치·교차 사용자/Reader/Reading 음성 시험 |
| **S7 화면·전달·법무** | 동일 채팅방 내 안전한 결과 결합, 사용자 제공 시점 증빙과 저장 확정 시각 분리, 적법한 환불 안내·고지 | S5~S6; 법무·상품 승인 | 전송 실패/중복/환불·부분 제공 증빙과 사용자 흐름 |
| **S8 최종 연동·출시 심사** | 데이터베이스 15/17, 실제 API, 개인정보 삭제·격리 복원, 권한 역할·배포 비활성화 확인 | S1~S7, 운영 이력 복구 | 단계별 병합 기준 SHA, 통합·보안 검증, 출시 담당자 승인 |

S1에서 공통 잠금 함수 자체가 성공하더라도 **S2 전체 경로가 동일 규칙에 참여하기 전에는 T2 안전성을 주장할 수 없다.**

## 4. S1 구현 계약 — 거래 전용 잠금 원시 기능

- 내부 함수: `public.internal_acquire_official_reader_scope_lock_v1(subject_id uuid, reading_ref uuid, reader_character_id text)`.
- 키: `(canonical Subject, Official Reading, Reader)`. 구매권 ID·묶음 ID를 잠금 키에 포함하지 않는다. 동일 범위의 새 구매권이 서로 다른 행으로 삽입되어도 같은 순서를 기다려야 하기 때문이다.
- 구현: `pg_advisory_xact_lock` + 고정 식별자 영역을 포함하는 64비트 해시. 현재 회원 거래 문맥 검증, 입력 공백/길이 확인, `SECURITY INVOKER`, 함수 실행권한 직접 회수.
- 호출자는 **명시적인 하나의 DB 거래** 안에서 실행해야 한다. 잠금은 거래가 끝나면 자동 해제된다.
- 현재 상품 권한을 반환하지 않는다. 공식 사주 소유·결속, 신규 권한 발급 자격, 환불의 정당성도 이 함수가 보증하지 않는다. 그러한 검증은 실제 소유 트랙에서 잠금 확보 후 수행한다.
- 비공개 권한 없는 SQL 함수·테스트용 인프라일 뿐 HTTP, Reader public API, 운영 권한을 열지 않는다.
- 64비트 해시 충돌은 서로 독립적인 범위의 불필요한 대기를 일으킬 수 있으나 접근 허용을 발생시키지는 않는다. 변경 계획에서 해시/잠금 명세는 모든 참여 경로가 공유해야 하며 무단 버전 전환 금지.
- **교착 예방:** 기존 `cmd_bind_standard_reading_access_v2`에는 Grant→Birth 등 이미 존재하는 잠금 순서가 있다. 기존 명령 전후에 함수를 임의로 붙이는 대신 새 호출 계약의 잠금 순서 표를 먼저 검증한다.

## 5. S2~S6 계약에서 특히 확인할 사항

### 권한과 시간
- T2에서는 구매권의 현재 status 및 유효기간, 현행 Product 정책, 공식 Reading 원본·Release/Bundle/Revision을 다시 읽는다. T1의 과거 승인 증명을 권한으로 사용하지 않는다.
- 현재 접근 조회 `internal_qry_character_standard_reading_access_v2`는 독립 구매권의 동일한 결과를 DISTINCT로 합칠 수 있다. 최종 진단에서는 원본 Grant 집합과 서로 다른 유효 Bundle 수를 별도로 검증한다.
- 환불 신청/승인, 외부 결제사 취소, 검증된 권한 회수 완료는 서로 다른 시점이다. 실제 권한 차단을 보증하는 사건과 전달 증거는 Commerce/Legal 계약에 따른다.
- 이미 확정된 과거 이력에 대한 `replayed=true`는 현재 구매권이 아니다.

### 출처와 보관
- `chat_turn_attempts.grounding_refs_jsonb`의 AI 실행 UUID는 공식 Saju `grounding_unit_*`가 아니다.
- RR-03 `official_reader_assistant_saju_provenance`의 문자열 형식 검사만으로 원본 출처가 진짜임을 보증하지 않는다. 최종 저장 시 사주 소유 근거 발행 증명이 있어야 한다.
- RR-04 `internal_qry_official_reader_followup_candidate_v1`는 조회 후보이며, 현재 Product 규칙과 원자 저장·T2 잠금이 결여되어 있어 운영 조회 권한이 아니다.
- 일반 Chat에 원문을 쓰지 않는 방안은 기존 `cmd_commit_chat_turn_v1` 및 Output/Memory/Outbox 전체 경로를 감사한 후 결정한다. 기존 메시지·출처 해시가 같다고 가정하는 RR-04 후보는 보호 본문 설계 후 수정해야 한다.
- 개인정보는 **탈퇴 시 삭제**, 승인된 복원 후 비재노출, 권한 회수 즉시 새 접근 차단을 유지한다. 새 보호 본문 테이블은 새로 분류·승인한다.

## 6. 금지·운영 차단

- Production의 과거 1400~1450 migration 이력/격리 백업 복구 증거가 부족한 상태에서 어떤 신규 migration도 운영에 적용하지 않는다(#1941).
- RR-03 #1960(비공개 저장 구조), RR-04 #1974(비공개 조회 후보)를 운영 승인/공개 함수로 착각하거나 기존 일반 채팅의 구매권 검증 대신 사용하지 않는다.
- 미승인 Product eligibility, 유료 Offer/결제, 생성형 공급자 정책, 공개 Reader Chat은 모두 차단한다.
- 정상적인 시험 녹색 결과만으로 실제 결제·유료 배포·개인정보 최종 승인이 완료되었다고 선언하지 않는다.

## 7. 이번 변경 요청의 실제 범위

- **완료 목표:** 이 로드맵 기록, S1 거래용 잠금 함수, 동일 범위/별개 범위/회원 문맥/권한 부정 실제 PostgreSQL 시험과 데이터베이스 검사 실행 경로 연결.
- **의도적으로 제외:** 기존 Commerce/Grant 발급·회수·환불 Writer 변경, 유료 해설 본문 테이블 생성, RR-03 실저장, RR-04 공개 조회, 유료 Chat 활성화.
- 다음 변경: S2 소유자 간 잠금 획득 순서 정리와 양방향 신규 Grant·회수·T2 경쟁 증명. S2 승인까지 S1은 독립적으로 보관하는 비공개 구성 요소다.


## 8. 실제 진행 기록 (2026-10-12)

| 단계 | 상태 | 정확한 검증 / 추가 조건 |
| --- | --- | --- |
| S0 설계 | **구현 완료, 검토 요청 중** | 이 문서 및 [#1983](https://github.com/gycha0109-beep/MyeongHa/pull/1983) |
| S1 잠금 원시 기능 | **격리 구현·검증 통과, 병합 보류** | #1983의 migration 1740와 이중 PostgreSQL 연결 시험; [검사 38200608330](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38200608330): PostgreSQL 15 핵심·콘텐츠, PostgreSQL 17, 운영 규칙 모두 성공 |
| S2 공동 잠금 계약 | **미완료** | 현재 구매·환불·회수·결속 원본 경로의 잠금 순서와 공동 참여 미구현. 별도 격리 경합 증명부터 착수 |
| S3 공식 출처 증명 | **미완료** | RR-02/06의 서버 검증 결과를 불변 저장에 연결해야 함 |
| S4 유료 본문 분리 | **설계안 / 개인정보 승인·구현 전** | 일반 채팅 저장/기억/알림/원문 유출 감사 필요 |
| S5 원자 저장 | **미완료** | RR-03 #1960은 저장 틀만 보유. 현재 권한·공식 출처·해설 본문 일괄 확정은 미구현 |
| S6 후속 조회 | **비공개 후보만 보유** | RR-04 #1974는 후보 조회만 구현. 최신 권한 및 실제 검증 답변 연계 미구현 |
| S7 화면·제공 증거 | **미완료** | 실제 인도와 내부 저장 시점 분리·법무 검증 필요 |
| S8 통합·출시 | **차단 유지** | 운영 1400~1450 이력 복구 증명, 출시 승인, 개인정보 삭제·복원 검증 필요 |

**점검 구분:** S1 시험의 녹색 결과는 공통 잠금의 동일 범위 직렬화가 성공했음을 뜻하며, Commerce 실제 Writer·환불과 공개 결과의 선형화가 완료됐음을 뜻하지 않는다. 새 단계는 독립 변경 요청으로 검증한다.


## 9. 본선 변화 및 분리된 검증 작업 (2026-10-12 추가)

- 최신 본선에는 `1720_standard_reader_product_scope_read_v1.sql`이 합류했다. S1 `1740_official_reader_scope_lock_private_v1.sql`과는 독립이며 두 기능 모두 보존한다. PostgreSQL 15 카탈로그 스냅샷은 **두 migration이 함께 적용된 실제 합성 DB**에서 재계산한다.
- S2 격리 경합 시험: [#1984](https://github.com/gycha0109-beep/MyeongHa/pull/1984). 제품/Commerce 실제 Writer 변경 없이 시험 호출자만 공통 잠금에 참여시켜, 새 영수증 발급 먼저/권한 회수 먼저의 순서 충돌을 실제 PostgreSQL 15에서 검증했다. 초기 확인한 [검사 38201976136](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38201976136)은 구 본선에서 성공했고, 신규 본선 재검증은 별도 진행한다.
- 잠금 이후 현재 유효 묶음 판정: [#1987](https://github.com/gycha0109-beep/MyeongHa/pull/1987). **0개 / 1개 / 여러 묶음 충돌**만 구분하는 비공개 함수. 기존 검증 [38202209130](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38202209130) 성공. 새 본선에서는 변경된 DB 스키마 기준값과 재검증을 요구한다.
- **선행 충돌:** RR-03 [#1960](https://github.com/gycha0109-beep/MyeongHa/pull/1960)의 `1720_official_reader_assistant_provenance_storage_v1.sql`과 현재 본선 Product `1720_standard_reader_product_scope_read_v1.sql`이 같은 1720 번호를 사용한다. 기존 RR-03/04의 근거 저장 내용을 삭제하거나 Product 기능으로 대체하지 않으며, 독립 번호 재배치·카탈로그·Privacy 삭제/복원 재검증 없이 병합/배포하지 않는다.
- **미완료:** 실제 Commerce 발급·환불·회수 Writer의 공동 잠금 적용, RR-03 신뢰 출처 원자 저장, 유료 원문 보호 격리와 Reader 정식 조회, 운영 1400~1450 복구. 세 작업 가지의 검증 성공도 유료 답변 공개 승인으로 해석하지 않는다.

## 10. S2 추가 구현: 잠금 이후 오래된 조회 시점 차단 (2026-10-12)

- 출발 문제: PostgreSQL의 거래 단위 공동 잠금은 쓰기 순서를 정렬하지만, `REPEATABLE READ` 또는 `SERIALIZABLE` 거래가 이미 확보한 과거 조회 시점을 자동으로 최신화하지 않는다. 잠금이 풀린 후 과거 구매권 상태를 현재 상태로 잘못 해석해서는 안 된다.
- 비공개 구현: `1750_official_reader_scope_current_bundle_private_v1.sql`의 `internal_qry_official_reader_locked_bundle_scope_v1`는 `READ COMMITTED`가 아니면 현재 구매권 판정을 즉시 거부한다. 다른 격리 수준의 안전한 새 조회 방식이 증명되기 전까지 예외 없이 차단한다.
- 실제 검증: 기존 `official_reader_scope_lock_s2_instrumented_race.sh`에 `REPEATABLE READ`와 `SERIALIZABLE` 거절을 추가했다. 일반 `READ COMMITTED` 경합은 이전과 같이 검증한다.
- 작업 분리: #1983(S1) → #1984(양방향 경합) → #1987(현재 묶음 판정) → **이번 격리 수준 차단 변경 요청** 순서로 의존한다. 각 부모가 아직 검토 중이므로 전체 본선 완료·출시로 선언하지 않는다.
- **남은 근본 차단:** Commerce의 실제 구매권 발급·회수·환불, Reader 결속, 최종 유료 답변 저장이 모두 같은 잠금을 **실제 구현 경로에서 먼저** 취득해야 한다. 이번 차단은 공동 잠금 미참여를 해결하지 않는다. 보호 본문·실제 사주 출처 증명·원자 저장·정식 조회도 미구현이다.

## 11. 실제 추가 Reader 결속의 잠금 선점 내부 명령 (S2 제한적 진척)

- 기존 `cmd_bind_standard_reading_access_v2`는 Purchase Intent → Grant → Birth 행 잠금을 내부에서 획득한다. 범위를 모르고 이 함수 이후 공통 잠금을 추가하면 획득 순서가 반대여서 교착 위험이 있다.
- 새로운 비공개 `1760_official_reader_additional_bind_locked_private_v1.sql`은 **기존 검증된 추가 Reader 구매**에 대해서만, 현재 Purchase Intent·Reader 선택·상품 명세·Birth revision·이미 존재하는 공식 Reading 정본에서 **정확히 한 개의 회원×공식 Reading×Reader 잠금 범위**를 계산한다.
- 그 범위를 선행 잠금한 뒤 기존 v2 결속 명령을 호출한다. 기존 명령이 되돌린 공식 Reading·Reader가 잠금 범위와 조금이라도 다르거나 새 공식 Reading을 생성하면 전체 SQL 문장을 오류로 취소한다.
- 동일 거래의 고정된 낡은 조회 시점이 발생하지 않도록 `READ COMMITTED`에서만 실행하며 `REPEATABLE READ`·`SERIALIZABLE`은 거부한다. 외부 사용자/API 역할은 이 명령을 직접 실행할 수 없다.
- 최초 공식 사주 구매·아직 확정되지 않은 공식 Reading·복수 후보·확정되지 않은 이력은 허용하지 않는다. `replayed=true`는 과거 결속 기록일 뿐 현재 구매권으로 승격하지 않는다.
- 독립 PostgreSQL 경합 시험 `official_reader_scope_lock_s2_instrumented_race.sh`의 실제 **새 구매권+추가 Reader 결속** 호출을 이 비공개 명령으로 변경하여, 테스트에서만 선행 잠금하는 수준보다 한 단계 더 나아간 실제 호출 후보를 검증한다.

**잔여 차단:** 영수증을 통한 신규 구매권 발급 자체와 환불·회수 Provider 이벤트의 원본 함수를 아직 바꾸지 않았다. 이 명령은 기존 Reader 결속 경로에 자동 적용된 것이 아니며, 외부 실행권한이 없다. 기존 결속 명령이 별도로 호출될 수 있는 한 전체 직렬화는 미완료다. 실제 Commerce 경로 및 최초 공식 Reading 처리 계약을 합의하기 전에는 공개·운영 적용이 불가능하다.

## 12. 추가 Reader 영수증 발급과 결속을 모두 실제 명령 안에서 선행 잠금 (S2 확대)

- 새 비공개 범위 결정기 `internal_qry_official_reader_additional_scope_candidate_v1(subject_id,purchase_intent_id)`: 확인된 추가 Reader Purchase Intent, 공식 Reading 정본, Product Spec, 현재 Birth revision으로 정확히 하나의 범위를 유도한다. 이 조회만으로는 잠금·구매권을 부여하지 않는다.
- 새 비공개 발급 명령 `internal_apply_additional_official_reader_receipt_locked_v1`: 신뢰된 Receipt→Purchase 계보에서 범위를 도출, **Receipt·Grant 행을 잠그기 전에 공통 잠금을 선행 취득**하고 기존 `internal_apply_verified_receipt_capability_effects_v1`를 그대로 호출한다. 잠금 전후 범위가 바뀌면 전체 호출 취소.
- 새 비공개 결속 명령 `internal_cmd_bind_official_reader_additional_locked_v1`: 같은 결정기를 사용해 잠금을 먼저 확보한 후 기존 `cmd_bind_standard_reading_access_v2`의 검증 및 기록을 재사용한다.
- PostgreSQL 2연결 실제 시험에서 새 구매권 발급+Reader 결속 호출자의 **수동 잠금 선행 코드를 제거**했다. 대신 위 두 명령이 스스로 같은 범위를 잠그는지, T2 유사 조회가 먼저면 발급이 대기하는지 확인한다.
- 이 두 후보는 아직 외부 실행권한이 없고 기존 운영 호출 경로로 배선되지 않았다. 초기 공식 Reading의 사주 식별자 확정 문제 및 Provider 회수·환불 Writer 경로는 여전히 별도 경계다.
- 공통 잠금 범위가 미확정인 신규 구매나 과거 결속 재생은 유료 접근 증명으로 전환할 수 없으며, 실제 제품에 유료 공개를 켜지 않는다.

## 13. 기존 결제사 이벤트의 구매권 회수에 공통 잠금 적용 후보 (S2 추가, 2026-10-12)

- 신규 `1770_official_reader_provider_revoke_scope_lock_private_v1.sql`: `internal_apply_official_reader_provider_revoke_locked_v1`는 **이미 사주와 Reader에 결속된 독립 구매권**의 취소(`revoked`)·만료(`expired`)에만 동작하는 비공개 후보 함수다.
- 외부 입력으로 사주/Reader를 선택하지 않는다. 결제사 이벤트 → 실제 영수증 → 독립 `entitlement_grants` 원본을 검증하고, 해당 구매권이 연결된 **모든** `standard_reading_reader_access_grants`에서 사주·Reader 범위를 도출한다.
- 사주 ID/Reader ID를 정렬해 S1 공통 잠금을 전부 **기존 결제사 이벤트/Grant 행 잠금 전에** 확보한다. 잠금 대기 후 범위·영수증 계보를 다시 읽는다. 범위 유실·추가·원본 계보 변경은 거절한다.
- 기존 `internal_apply_entitlement_effect_v1`의 검증된 결제사 순서, 영수증 원본, 구매권 수정 이력, 권한 재계산·알림 내보내기·중복 처리 의미를 그대로 재사용한다. 이 함수는 구매권 상태를 직접 수정하지 않는다.
- `READ COMMITTED`가 아니거나, 영수증/구매권 출처를 확인할 수 없거나, 연결된 공식 사주가 없거나, 취소·만료 외 이벤트라면 차단한다. 서비스·브라우저 실행 권한 없음.
- 실제 PostgreSQL 양방향 경합: **권한 회수 먼저 → 유료 조회 대기 및 차단**, **권한 확인 먼저 → 회수 대기 및 거래 완료 후 차단**. 원래의 별도 Provider-event 경합 시험은 보존한다.
- 새 파일과 독립 실 DB 시험: `test/db/official_reader_provider_revoke_scope_lock_private.sh`. `test/db/run_authority_core.sh`의 격리 시험으로 등록한다.

**개발·운영 차단:** 실제 PortOne/기타 결제사 콜백 호출자가 이 함수를 사용하지 않는다. 기존 `internal_apply_entitlement_effect_v1`의 직접 호출과 등록된 운영 Writer는 여전히 잠금 우회가 가능하다. 최초 Reading 발급, 미결속 구매권, 한 효과가 미확인 범위까지 영향을 주는 경우는 지원하지 않는다. 따라서 S2 전체 잠금 통일 및 유료 T2 공개 권한은 **미완료**. RR-03/04 사주 출처 원자 저장·보호 원문·후속 조회도 계속 차단한다.

## 14. 검증된 결제사 환불 이벤트 → 공통 잠금 연결을 위한 비공개 실행 계약 (2026-10-12)

**확인한 실제 현황:** `apps/api/src/commerce-provider-payment-completion-orchestration.ts`는 **결제 완료 확인**에 한정되며, 검증된 결제사 환불 이벤트를 Entitlement Effect 회수로 보내는 정식 HTTP/Worker 경로는 현재 저장소에 없다. `executePostgresCommerceInternalTransactionV1`은 유저 로그인 문맥과 분리된 `myeongha_commerce_internal_executor` 역할로 실행한다. 이를 일반 회원 컨텍스트로 가정하거나 클라이언트가 제공한 회원 ID를 신뢰해선 안 된다.

**이번 구현(1780):** `internal_execute_official_reader_verified_provider_revoke_v1`는 비공개·`SECURITY DEFINER` 내부 연결 후보이다.

1. 사전에 저장된 `commerce_provider_events` 중 **production 검증 완료 `payment.cancelled` 이벤트**로부터 production Receipt와 정확한 독립 구매권의 동일 회원을 유도한다. 사용자·사주·캐릭터 식별자를 함수 입력으로 받지 않는다.
2. 이미 거래에 묶인 회원 문맥이 다른 경우 거부하고, 검증된 회원 ID만 거래 한정 내부 문맥으로 설정한다. 일반 사용자 역할의 회원 신원 확인 함수를 환불 이벤트에 오용하지 않는다.
3. 앞 단계의 `internal_apply_official_reader_provider_revoke_locked_v1`를 호출해 모든 결속된 공식 Reading×Reader에 대한 잠금을 먼저 획득하게 한 뒤, 검증된 Commerce 원본 효과를 적용한다.
4. 성공·실패 시 회원 문맥을 복원한다. 사전에 영수증/Grant의 변경 잠금을 먼저 잡지 않는다. `READ COMMITTED`가 아닌 거래는 차단한다.
5. **함수 직접 실행권은 Commerce 내부 역할을 포함하여 전부 회수**하고, 단독 사용자·외부 서버·결제사 콜백·API 경로에 연결하지 않는다. 검증된 이벤트 입력의 취소 사유/타임스탬프 정규화와 운영 실행자 승인 전까지 활성화할 수 없다.

**실제 DB 검증:** `official_reader_verified_provider_revoke_bridge_private.sh`는 회원 문맥 없이 실행한 verified Provider 취소를 통해 양방향 잠금 경합, 실행 이후 회원 문맥 복구, 기존 독립 구매권 회수 및 조회 차단, 미인증 실행 역할·서로 다른 회원 문맥 거부를 검증한다. `run_authority_core.sh`에서 독립 PostgreSQL 시험으로 실행한다.

**남은 차단:** 안전한 Refund ingress 및 Provider Event 검증/정규화/순서의 소유 계약, Commerce 전용 최소 권한 호출자와 실제 엔드투엔드 회수(실결제 이벤트 사용) 검증, 최초 공식 Reading 구매를 위한 별도 잠금 정렬, RR-03 근거 증명/유료 보호 본문/원자 저장, RR-04 후속 조회, 운영 1400~1450 복원 증거. 비공개 SQL 후보의 검사 성공만으로 실거래 연동이나 법적 환불 결정을 선언하지 않는다.

## 15. 최초 공식 Reading UUID 생성 전 공통 잠금 기반 (S2 INITIAL, 2026-10-12)

### 왜 기존 잠금으로는 안 되는가

추가 Reader·현재 유료 사주 T2의 잠금 키는 `회원×공식 Reading UUID×캐릭터`다. **최초 공식 사주 구매권을 발급할 때는 아직 공식 Reading UUID가 생성되지 않았다.** 사용자나 클라이언트가 제안한 임시 UUID를 대신 잠그면 같은 구매권이 다른 잠금 키를 선택할 수 있다. 이 문제를 해결하기 위해 **공식 구매 기록에서 확정되는 `회원×상품`**을 첫 바깥 잠금 범위로 설계한다.

### 구현: `1790_official_reader_initial_product_scope_private_v1.sql`

- `internal_acquire_official_reader_product_scope_lock_v1(subject,product)`: 트랜잭션 범위의 비공개 `pg_advisory_xact_lock`. 기존 Reading scope와 다른 고정 네임스페이스, 길고 지속적인 잠금 대신 COMMIT 시 자동 해제.
- `internal_qry_official_reader_initial_product_candidate_v1`: 검증된 최초 구매 `Purchase Intent`와 서버 소유 Offer, `initial_reading` 역할, 선택 Reader, 활성 Product Spec, 공식 Reading 정책이 모두 **정확히 하나**일 때에만 Product UUID를 반환. 후보 조회만으로 권한을 부여하지 않는다.
- `internal_apply_initial_official_reader_receipt_locked_v1`: 검증된 실제 production Receipt→Purchase Intent에서 Product 확인 → **행 잠금 전 Product 공통 잠금** → 기존 1090 영수증 권한 발급 명령 → Product 재검증. 구매권/이벤트/권한 재계산은 기존 Commerce 명령이 소유한다.
- `internal_cmd_bind_initial_official_reader_locked_v1`: 구매 기록에서 Product 확인 → Product 공통 잠금 → 기존 `cmd_bind_standard_reading_access_v2` 수행. 기존 함수가 `initial_reader`를 반환하고 실제 첫 공식 Reading을 생성한 경우만 성공하며, 동일 요청의 공식 Binding 재생은 원본 v2의 불변 이력에 따라 허용한다.
- 구매 정보 미확정·다른 상품/회원·추가 Reader 구매·기존 권한과 다른 결과·오래된 거래 조회는 모두 실패. `Commerce internal executor`, `service_role`, `API executor`, 브라우저 역할에는 **실행 권한을 주지 않는다**.

### 검증

- `test/db/official_reader_initial_product_scope_lock_private.sh`: 기존 공식 사주 테스트의 **첫 영수증 권한 발급/첫 Reading 생성 두 명령만** 1790의 비공개 함수로 대체하여 원본 전체 계약을 실행. 동일 계약 재생, 추가 Reader·미확정 구매·다른 회원/오래된 격리 수준 차단, 동일 회원×상품 두 연결 간 실제 Lock 대기와 다른 상품의 독립 진행 검증.
- 기존 `run_authority_core.sh` 독립 DB 시험 추가. PostgreSQL 15·17 및 전체 CI 통과 전에는 단계 완료가 아니다.

### 전체 경로 공유 잠금 순서 및 차단

**목표 전역 순서:** `회원×Product`(최초 구매 전/후 동일 외부 잠금) → `회원×Reading×Reader`(Reading 존재 시 추가 잠금) → Commerce Provider/Receipt/Grant → Birth/읽기·응답 최종 확정. 실제 각 Writer의 선행 잠금은 모두 동일 순서를 사용하는지 먼저 검증해야 한다.

- 이번 변경은 **첫 구매**에 대해서만 바깥 Product 잠금을 구현하며 **기존 추가 Reader 권한 발급·회수·T2 조회는 여전히 직접 Product 잠금을 취득하지 않는다.** 모든 Writer의 바깥 잠금 적용과 교착·환불/조회/재시도 경합을 확인하기 전까지 전체 잠금 통일 선언 금지.
- 검증된 Provider 취소 이벤트의 안전한 호출자, RR-03 공식 Saju 근거 출처 실검증, 일반 채팅에서 보호하는 유료 본문, RR-04 정식 후속 질문 및 운영 DB 복원 #1941은 모두 미완료.
- 어느 단계의 비공개 SQL 결과도 실제 상품의 공개 결제·Reader Chat 서비스 활성화·Privacy 보관 승인·Legal 환불 판정이 아니다. 초기 권한 발급과 원본 공식 Reading의 지속적 동일성은 후속 통합 계약에서 함께 검증한다.


## 16. S2→S6 전역 잠금·유료 T2 상세 설계 (2026-10-12)

- 상세 설계 원문: [OFFICIAL_READER_UNIFIED_AUTHORITY_T2_DETAILED_DESIGN_20261012_V1.md](./OFFICIAL_READER_UNIFIED_AUTHORITY_T2_DETAILED_DESIGN_20261012_V1.md).
- **검토 기준:** #2006 최신 검증 HEAD `5127e8f`; 기존 migration 1740~1790, 1080/1220/1270/0220, RR-03 #1960, RR-04 #1974, Product/Commerce 정책.
- **가장 중요한 변경 제안:** 첫 구매만의 `회원×Product` L0와 추가 구매/회수/현재 조회의 `회원×Reading×Reader` L1을 **전역 단일 선행 순서 L0→L1→원본 행 잠금**으로 통일한다. 현재 후보 구현은 경로별 한 단계만 처리하며, 본 문서는 이를 구현 완료로 판정하지 않는다.
- **새로 확인한 P0 구멍:** 미결속 최초 Grant는 `1770`이 거부하므로 환불이 bind보다 앞서면 Product L0만으로 처리할 별도 경로 필요; `1780`은 실제 callback/Commerce worker에 연결되지 않음; 현행 PortOne webhook은 `Transaction.Paid` 외 이벤트를 ignored 처리하므로 검증된 취소 ingest 자체가 필요하다.
- **Reader T2 위험:** `0220`은 일반 메시지 원문·세계/관계/기억·Outbox를 확정한다. 원문 분리만으로 충분하지 않다. RR-03 원자 finalizer는 전용 유료 저장 경계를 가져야 하며 RR-04의 기존 `conversation_messages.content_hash=provenance.utterance_hash` 전제도 재설계 필요.
- **Saju 진실성:** RR-03 `grounding_unit_*` 형식 검사는 실제 Unit 소유/closure 증명이 아니다. Saju source-owned manifest + Semantic/Output proof를 필수로 설계. preview-held 전송 증명은 생산용 승인으로 사용할 수 없다.
- **Migration 충돌:** RR-03 Draft의 `1720`과 본선 Product `1720` 번호 중복은 독립 재번호/전체 DB catalog 검증 전 병합 불가.

**다음 순서:** D0 설계 승인(Owner 결정 Q1~Q3 및 락 역전 감사) → D1 전역 잠금 범위 resolver → D2 초기/추가 구매권 발급·결속 공동 진입점 → D3 provider 취소·미결속 revoke/restore → D4 Saju 증거 → D5 보호 유료 본문/원자 T2 → D6 RR-04 및 제공 E2E.

**이번 변경은 docs-only 설계 작업**이다. SQL·TypeScript·DB 권한·운영 경로·CI 코드 변경 없음. 비공개 후보들의 기존 검사 성공은 유지하되 운영 결제/유료 사주 채팅 공개·마이그레이션 적용은 계속 HOLD.

## 17. D1 전역 잠금 진입점 / 기존 Writer Lock Order 감사 (2026-10-12)

- 신규 감사: [OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md](./OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md).
- **이번 코드:** `1800_official_reader_unified_scope_entry_private_v1.sql`. 기존 공식 Reading/Reader는 source-owned Product를 도출하여 **L0 Product→L1 Reading/Reader** 잠금 후 재확인. verified 최초 구매는 L0만, verified 추가 Reader 구매는 L0→L1을 획득하는 비공개 진입점을 분리한다.
- **시험:** `official_reader_unified_scope_entry_private.sh`는 기존 합성 구매·Reading fixture를 사용하고, 동일 Product의 다른 Reader에 대해 실제 PostgreSQL advisory lock 대기, 다른 Product 독립, 두 잠금 보유, 잘못된 Subject/Reading/Isolation/Role을 부정한다. `run_authority_core.sh` 격리 CI에 등록했다.
- **Writer 감사 결과:** 기존 `1090/1080/1220/0220`는 권한·Chat 행을 잠그지만 L0→L1을 강제하지 않는다. 기존 `1760/1770/1750`는 L1만, `1790`은 초기 경로의 L0만 취득한다. `1780` 실제 결제사 운영 호출자 권한은 열지 않았다.
- **엄격한 현황:** 공통 진입점 **함수 구현 및 좁은 경합 증명**이지 기존 운영 Writer Cutover, 다중 Product 전체 정렬, 현재 유료 T2 보증은 아니다. 기존 Reader/Commerce 경로의 L1 선행을 전역적으로 제거하기 전까지 충돌과 경쟁 안전성 완료라고 선언하지 않는다.
- **다음:** 다중 Product/Reader lockset 정렬과 전역 경합 검증(D1 확장) → 최초/추가 Receipt·Binder의 공통 진입점 연결(D2) → Provider cancel/revoke/restore 및 미결속 Grant(D3) → Saju-owned 출처(D4) → 유료 본문·원자 T2(D5) → 후속 조회(D6).
- **차단 유지:** 공개 유료 채팅·실제 환불·운영 DB migration·결제 개시 OFF; RR-03/04 충돌, 개인정보/법무/Commerce 승인과 #1941 복구 증거 미완료.

## 18. D1 다중 범위 정렬 잠금 + PostgreSQL 3-세션 경합 (2026-10-12)

- `1810_official_reader_ordered_multi_scope_lockset_private_v1.sql` 추가: 실존 Product Lockset L0 **전체를 먼저 오름차순** 확보하고, 정본 공식 Reading에 연결된 L1 Reading×Reader 쌍 **전체를 다음에 정렬하여** 잠그는 비공개 원시 함수를 분리했다.
- Reading Lockset의 Product는 호출자가 권한으로 제시하는 값이 아니라 `standard_reading_official_bindings`에서 매번 도출하며, 잠금 전·L0 후·L1 후 동일성을 재검증한다. 현재 Grant·환불 가능·Reader 공개 허가와는 관계없다.
- 최대 입력 64개·중복/NULL/배열 불일치·회원 실행 문맥·`READ COMMITTED`·실존 Product/Reading 검증, 런타임 SQL 실행권 거부.
- `test/db/official_reader_multi_scope_lockset_three_session.sh`: PostgreSQL 실제 A/B/C 연결에서 **정순/역순 2 Product Lockset 경쟁**과 **역순 2 Reader Lockset 경쟁**을 각각 확인한다. 독립 격리 시험으로 DB authority core에 등록.
- 상세 감사 문서 [OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md](./OFFICIAL_READER_D1_WRITER_LOCK_ORDER_AUDIT_20261012_V1.md) 4절에 입력의 권위·교착 범위·남은 우회 경로를 갱신한다.
- **미완료:** 모든 Commerce/Reader Writer가 이 순서를 사용하도록 전환, Verified Provider event 영향 범위 서버 resolver, 미결속 취소, 3-세션의 현실적 Grant Writer vs refund vs T2 통합 경쟁, Saju 근거·유료 본문 원자 T2·RR-04. 운영 DB migration·결제/유료 채팅 공개 계속 OFF.

## 19. D2 초기·추가 구매권 발급/사주 결속 단일 비공개 진입점 (2026-10-13)

- `1820_official_reader_unified_purchase_dispatch_private_v1.sql` 후보: `internal_apply_official_reader_verified_receipt_unified_v1`과 `internal_cmd_bind_official_reader_unified_v1`. 검증된 production Receipt→Purchase Intent→원본 Offer 및 server-owned 구매 역할을 읽고 `1800` 구매 Scope Resolver에서 **회원×상품(L0), 추가 Reader에 한해 사주×캐릭터(L1)**를 원본 Commerce/Grant/Birth 행 잠금 전에 획득한다.
- 최초 구매는 원본 `1790`에, 추가 Reader는 `1760`에 위임한다. 이들은 다시 같은 잠금을 취득할 수 있지만 역순 잠금은 새로 획득하지 않는다. 기존 `1090` 구매권·영수증 CAS/멱등·`1220` 불변 사주 결속 원본에 신규 직접 행 변경을 추가하지 않는다.
- 진입 전에는 정확한 Receipt/Intent/Offer/Subject 계보를 확인하고, 잠금 대기 후 다시 검증한다. 이후 원본 함수 결과의 제품·구매 역할·Reading·Reader 범위와 source scope를 확인하고 이탈 시 전체 롤백한다.
- 격리 DB 시험 `test/db/official_reader_unified_purchase_dispatch_private.sh`: 기존 공식 사주 생성 fixture에서 첫 발급/첫 생성 및 추가 캐릭터 결속을 신규 dispatcher로 대체; 이미 발생한 추가 영수증의 원본 replay 시나리오, wrong Subject·오래된 MVCC·런타임 EXECUTE 거부를 검증. `run_authority_core.sh` 등록.
- **제한:** 신규 `1820`도 실제 Commerce API·Provider worker·사용자 실행 역할에는 열지 않았다. 기존 `1090/1220/1760/1790` 직접 호출 우회는 아직 가능하다. 추가 구매 영수증의 **최초 발급**과 환불·회수 경쟁, 미결속 초기 구매권 취소, 다중 Product Provider 이벤트, RR-03 출처/보호 본문 T2, RR-04 후속 조회는 이어서 검증·구현해야 한다.
- **출시 차단:** 비공개 함수·합성 거래 테스트는 실결제 운영 계약이 아니다. 운영 마이그레이션 #1941 복원 및 DB/Commerce/Product/Privacy/Legal 검토 전 병합·공개 결제·유료 Chat OFF.
