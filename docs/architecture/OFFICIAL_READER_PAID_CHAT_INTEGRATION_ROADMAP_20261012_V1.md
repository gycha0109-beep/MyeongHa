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

## 19. D2 진행 — 공식 Reader 최초/추가 구매권 발급·결속 공통 진입점 (2026-10-13)

**구현 단계: 비공개 후보 (Draft, Production/Checkout/Chat OFF).** D1 #2012 (`760e599`)를 부모로 신규 `1820_official_reader_unified_issue_bind_private_v1.sql` 및 `official_reader_d2_unified_issue_bind_three_session.sh`를 추가했다.

- `internal_apply_official_reader_unified_receipt_v1`: production/verified Receipt → 동일 Subject·Intent·Offer의 DB 정본 일치 확인 → D1 `internal_acquire_official_reader_purchase_scope_v2` 사용. `initial_reading`은 L0만, `additional_reader_interpretation`은 Reading 정본에서 L0→L1. 이후 원본 `1090` 실행; 원본 Commerce CAS/Provider ordering/Grant ledger/Outbox 유지. 전후 Intent/Receipt/Role/Reading/Reader scope 재검사 실패 시 거래 전체 오류.
- `internal_cmd_bind_official_reader_unified_v1`: 동일 D1 공통 scope를 원본 `1220`의 Purchase/Grant/Birth 행 잠금 **전에** 확보. DB 정본 Reader/Bundle selection을 조회하고 원본 결과의 Product/Reader/Bundle/Role/Official Reading을 재검사. 최초 신규 bind는 공식 Reading 생성 필수, 추가 Reader는 기존 Reading 재사용만 허용. 원본 멱등성·Birth authority 유지.
- 기존 `1090/1220`, `1760/1790`, `1080/1770/1780`, `0220` 함수 및 실제 runtime 호출 경로/GRANT는 변경하지 않았다. **기존 직접 Writer 우회 경로는 현재도 존재한다.** 이 신규 진입점에 PUBLIC, API/Commerce/Chat executor의 직접 SQL `EXECUTE`는 부여하지 않았다.
- PostgreSQL 격리 fixture에서 positive 최초 Receipt와 최초/추가 bind를 D2 함수로 대체하고, 동일 Product에 대한 3개 실제 연결의 L0 대기 및 독립 Reader bind 멱등 재생·상태 보존·wrong subject/ACL/isolation 거절을 검증한다. 원본 test가 먼저 합격하더라도 신규 테스트 및 PostgreSQL 15/17 CI의 최종 결과 확인 전 **D2 완료 선언 금지**.

**잔여 필수 검증/차단:** 신규 추가 Receipt가 공식 Reading commit보다 앞서는 경우 D1 source-bound resolver가 FAIL-CLOSED하며, 구 Commerce 호출자가 원본 1090/1080을 직접 사용하는 팬텀은 아직 막을 수 없다. 전체 1080 refund writer와 D3 trusted provider cancel/restore가 공통 L0→L1을 채택하고, 추가 신규 Grant INSERT·Birth 변경·Bundle ambiguity·부분 실패 경합 시험이 통과해야 D2→D3 통합 안전성을 주장할 수 있다. #1941 복원, Product/Commerce/Reader/Privacy/Legal 검토 및 병합/운영 승인은 계속 차단한다.


### D2 최종 검증 (2026-10-13)

- Draft PR #2024, exact code SHA `ea2503e502faac8e659785d22878ab7497975237`.
- CI https://github.com/gycha0109-beep/MyeongHa/actions/runs/38333789245: PostgreSQL15 DB authority-core, PostgreSQL17 dependency, Content dependency, Work Track, CI Verify 모두 PASS. 같은 SHA의 Governance와 Web PR Domain Gates도 PASS.
- 범위: `1820` 비공개 1090/1220 wrapper와 PostgreSQL 실제 다중 연결 Receipt 신규 Grant INSERT/Reader bind 경쟁. 기존 Writer 원본에는 외부 cutover 및 ACL 변경이 없다.
- 최초 Catalog hash mismatch 교정 후 최종 검증 PASS. 예상 해시: `645387bbf029d85e5413ba61fa696106d8522056407c13f98e21c60ffe478bf7`.
- D2 PRIVATE 검증 완료. 하지만 direct 1080/1090/1220/1760/1790, Provider 환불, 미결속 Grant, D5 T2, 운영 #1941 복원 및 Product/Commerce/Privacy/Legal 승인 미완료. 병합/운영 공개 HOLD.

## 20. D3 단계적 구현 — Verified cancellation L0-first / 미결속 최초 Grant (2026-10-13)

**D3a 비공개 구현 후보, 전체 D3 완료 또는 운영 refund 활성화 아님.** PR #2024 D2 이력을 부모로 둔 신규 `1830_official_reader_verified_cancel_unified_scope_private_v1.sql`를 추가하였다.

- 새 `internal_apply_official_reader_verified_cancel_scope_v2`: DB 검증된 `payment.cancelled` Provider Event→production Receipt→정본 Purchase Intent/Offer/Standard Product→단일 Purchase Grant를 조회하고, 해당 Grant의 연결된 공식 Reading×Reader 행 전체를 조회한다. **미결속 최초 Grant는 해당 Product L0만 선행**, 기결속 Grant는 Receipt Product와 모든 공식 Reading 정본 Product가 정확히 일치하는지 검사 후 Product L0→모든 Reading/Reader L1을 정렬해 확보한다. 대기 이후 원본 scope 재검증하고 원본 `1080`에 변경 없는 CAS·ordering·ledger·outbox를 위임한다. 범위 변동은 Statement 전체 rollback.
- `internal_execute_official_reader_verified_cancel_v2`: DB-verified event/receipt/grant에서 canonical Subject를 도출하는 *dormant* SECURITY DEFINER bridge. 기존 다른 Subject 문맥 덮어쓰기 금지, 임시 문맥 예외 포함 복원. PUBLIC/anon/authenticated/service_role/API/Commerce executor 직접 EXECUTE 없음.
- `test/db/official_reader_d3_verified_cancel_unified_three_session.sh`: 기존 verified Provider 두 방향 실제 PostgreSQL Reader 경합 시나리오를 D3 경로로 재실행하고, 독립 첫 구매 Receipt/Grant를 **공식 Reading 결속 없이** 새로 발행하여 L0 대기→환불 COMMIT→Grant revoked 및 정확한 Event ledger→환불 후 bind 거부 및 신규 Reading/Reader 권한 0을 검증한다. 이 테스트는 원본 DB fixture 및 disposable DB에서만 실행한다.
- **D3 미완료 차단:** source-verified refund ingress/PortOne event normalization이 운영 호출자에 연결되어 있지 않다. 다른 provider event·restore·partial cancellation·만료 재권한·여러 Grant/Product 동시 영향은 이 narrow helper에서 거부한다. 1080/1770/1780 구 direct caller와 모든 Product/Commerce mutation cutover 미완료. legacy `1750` Reader 조회도 L0 선행이 아니므로 유료 T2와 공개는 계속 HOLD.
- **실행 상태:** D3a 신규 SQL/테스트/문서 등록만 됐으며 CI exact HEAD PostgreSQL 15/17 실제 시험 결과가 확인되기 전 PASS 선언 금지. #1941 운영 복원, Product/Commerce/Privacy/Legal/DB 승인 전 merge/Production/Checkout/Paid Chat 금지.

### D3a exact-SHA 최종 검증 (2026-10-13)

- PR #2028의 마지막 **코드·테스트 SHA**: `0146a2de2db2a6437cf2b61f93dc8dcbeab20533`. CI [38336400038](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38336400038)에서 PostgreSQL 15 `db-authority-core` / PostgreSQL 17 dependency / Content dependency / Work Track / CI Verify 모두 SUCCESS. 동일 SHA의 Governance와 Web PR Domain Gates SUCCESS.
- 직접 DB 로그의 검증 결과: `PASS D3: D3 bound Grant: real two-session Provider-first and Reader-first race, final revoked deny`; `PASS D3: first Reading unbound verified Grant: canonical L0 wait, revoke + ledger atomic COMMIT, zero Reader access`; `PASS D3: unbound refund-before-bind denies new official Reading and Reader access`. Catalog snapshot PASS `347eaaf2d0b1ddc3fcd88ff130c017864cb986edaf7940f44063dbd11bd6501b`.
- 재검토 과정: 첫 실패는 새 `1830` 함수 추가로 인한 Catalog hash 불일치, 둘째는 신규 경합 스크립트의 Bash heredoc 구문 오류. 둘 다 수정 후 위 exact SHA에서 재검증 성공.
- 판정: **D3a PRIVATE 구현 및 검증 완료**. 상용 refund ingest, old Writer direct bypass, event 영향을 받는 여러 상품의 동시 회수, partial/restore, D5 T2 원문 공개 허가는 여전히 HOLD. D3b는 영향 집합 원자 잠금·검증부터 별도 Draft에서 진행.

## 21. D3b 검증된 Provider 영향 전체 집합 선조회·다중 잠금 후보 (2026-10-13)

- **비공개 Draft 구현 / 전체 D3 미완료.** `1840_official_reader_verified_cancel_impact_lockset_private_v1.sql`은 trusted Provider Event ID + Grant ID 동수 배열(1~64)에 대해 DB verified `payment.cancelled` → production Receipt → 정확한 Purchase Intent/Product Offer/Standard Reading Product → 해당 Grant 전체를 source-owned 조회한다. 동일 Receipt의 다른 purchase Grant를 빠뜨리면 FAIL CLOSED; 다른 Subject·거래·Product/Reader에 속하는 결속은 DENY.
- `internal_qry_official_reader_verified_cancel_impact_v1`은 **무잠금 조회**로 각 Provider/Receipt/Grant의 status/revision/ordering/Reader bound scope를 정렬한 authority snapshot 및 실제 영향 Product·Reading·Reader·Grant 배열을 제공한다. 구매권·환불 확정·재열람 허용의 증거가 아니다.
- `internal_acquire_official_reader_verified_cancel_impact_lockset_v1`은 전체 Product L0를 UUID 정렬 취득 → fresh source-owned snapshot 대조 → 기존 D1 Reading lockset으로 모든 Reader L1 정렬 취득 → fresh snapshot 재대조. 변화나 미해결 범위는 rollback. **원본 1080 효과를 호출하거나 Grant를 변경하지 않는다.**
- `test/db/official_reader_d3b_verified_impact_lockset_three_session.sh`는 독립 verified Receipt/Grant 두 쌍, 공식 Reading×Reader 결속 집합, 서로 뒤바꾼 Provider 입력 순서에 의한 PostgreSQL A/B/C 실제 L0 advisory wait, current Grant 무변경을 확인한다. 다른 회원·위조 이벤트/Grant 매칭·중복·오래된 격리·직접 runtime EXECUTE를 부정한다.
- 이 첫 시험 fixture에서 실제 영향 Product는 **1개**다. D1 별도 2-Product 역순 잠금 시험은 통과했으나 이것을 D3b 실제 서로 다른 구매 Product refund 원자 효과 성공으로 둔갑시키지 않는다. 여러 Product를 실제 Provider 취소 하나의 트랜잭션으로 적용하는 것은 D3 후속 과제다.
- **차단 유지:** D3b 신규 resolver 결과만으로 부분 취소/restore/다중 Grant 회수를 실행하지 않는다. PortOne cancellation ingress 서명·조회·부분 환불 검증, full set mutating dispatcher, 기존 1080 direct bypass 차단, Commerce+Security+Legal Owner 승인 필요. 병합·운영 배포·유료 공개 금지. PostgreSQL 15/17 exact-SHA CI 결과 확인 전 이 구현을 PASS로 표시하지 않는다.

### D3b exact-SHA 검증 확정 (2026-10-13)

- Draft PR #2031, 검증 코드 커밋 `352791b5c176f3144a13a63e426c2f5300dec01b`. CI [38337875997](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38337875997)에서 PostgreSQL 15 DB Authority Core / PostgreSQL 17 / Content / Work Track / CI Verify / Governance / Web PR Domain Gates 모두 PASS.
- 실제 PostgreSQL 15 job log: `PASS D3b: verified event-to-Receipt-to-two Grants, two bound Reader scopes; no effect`; `PASS D3b: provider mismatch, duplicate/incomplete set, ACL, Subject and isolation denied`; `PASS D3b: three PostgreSQL sessions, reverse verified pair order, L0 wait and no Grant mutation`.
- 최종 schema catalog `8852d1a7ee13d219383798b754fa8f8241ecfd72302f672199e844ffdc8130db`, 86 public tables, PASS.
- 1차 자체 검토에서 fixture의 B2/B3가 **이미 revoked**인 사실을 재확인하여 lock-only 시험이 권한을 재활성화하지 않도록 테스트 기대값을 수정. 신규 1840 함수 2개에 따른 Catalog hash 변동도 실제 PostgreSQL15 값으로 교정.
- **D3b PRIVATE 범위 검증 완료.** 이 구현은 2개 이벤트/독립 Grant가 *같은 Product*에 귀속되는 fixture에서 검증한 **read-only impact inventory 및 source-owned L0→L1 잠금**이다. 다른 Product를 가로지르는 실제 다중 환불 원자 효과, 신뢰된 PortOne cancellation ingest, 부분 취소·restore, 구 Commerce Writer cutover는 미완료. 이 PR도 Draft/운영 HOLD.

## 22. D3c 비공개 원자 Full-Revoke 배치 + 기존 Writer 우회 감사 (2026-10-13)

**현황: 구현 후보 / exact SHA PostgreSQL CI 확인 전 PASS 아님 / 운영 금지.**

신규 `1850_official_reader_verified_cancel_atomic_batch_private_v1.sql`는 verified cancellation Event→Receipt→Grant *전체* 집합에 D3b의 source-owned 전 영향 Product L0 → Official Reading×Reader L1 잠금을 먼저 확보하고, 그 후 기존 `1080 internal_apply_entitlement_effect_v1`을 Grant ID 오름차순으로 호출한다. `1080`의 expected revision/provider ordering CAS·ledger·projection·outbox는 재구현하지 않는다. Batch는 한 PostgreSQL 함수 Statement에서 전부 `revoked` + 신규 Ledger Event가 성립할 때만 성공. 이벤트 누락·다른 회원·불완전 Receipt Grant set·stale CAS·부분 실패 시 RAISE하여 앞선 Grant mutation도 statement-atomic rollback. Replay는 이 **좁은 활성 Grant 전용 batch**에서 재적용하지 않으며 각 이벤트 원본 replay contract는 원본 1080이 소유한다.

`test/db/official_reader_d3c_verified_cancel_atomic_batch.sh`는 D3b 3-세션 real wait fixture를 재사용한 뒤 독립 검증된 Provider 이벤트 2건·Receipt 2건·Grant 2건의 synthetic Full revoke를 수행한다. **정렬상 두 번째 Grant만 revision이 틀린 경우**, 첫 번째 Grant 변경과 entitlement_events가 전부 rollback되는지 확인하고, 올바른 batch는 2건 COMMIT/정확한 Ledger 2건으로 검증한다. Replayed terminal batch, API/Commerce/Runtime 직접 EXECUTE 권한은 거부한다.

**Provider 진실성 경계:** `commerce_provider_events.event_type='payment.cancelled'`와 `status='verified'`는 환불 금액·부분 환불·잔액·Legal 제공 상태를 자동으로 증명하지 않는다. 서버 소유 'provider API 재조회 → full/partial 여부 및 동일 거래 검증 → 승인된 Full-Cancel policy'가 구현/검증되기 전 `1850`을 외부 호출자에 연결하면 안 된다. 즉 *DB full-revoke 원자 처리* 후보와 *실제 환불 권한*은 별개다. 여러 실제 Product를 묶는 provider 취소, stale Provider ordering 판정, 보정·복구·사후 환불 및 복수 세션 T2 역전 검증은 미완료.

**기존 Writer 우회 감사:** `1080` 원본은 Provider Event `FOR UPDATE`→Grant `FOR UPDATE` 후 CAS 및 Entitlement Event/Projection/Outbox를 쓴다. 직접 호출에는 L0→L1 강제가 없다. `1090` 원본 Receipt 발급도 별도 L0를 강제하지 않고, `1220` 공식 Binder는 Purchase Intent/Grant/Birth 행 잠금 후 변경한다. `1760` 추가 Reader 및 `1770/1780` 회수 legacy private 함수는 L1-only이고 `1790` 최초는 L0-only다. 현행 Production TypeScript `apps/api/src/postgres-commerce-internal-execution.ts`는 Commerce 내부 Role로 별도 트랜잭션을 수행하지만, `commerce-provider-payment-completion-orchestration.ts`는 활성 Payment evidence persistence만 연결한다. `portone-v2-webhook-payment-completion.ts`는 인증된 `Transaction.Paid` 외 type에 `kind:'ignored'`를 반환하므로 Verified cancellation → 1850 호출이 없다.

**강한 HOLD:** 직접 1080/1090/1220/1760/1770/1780/1790 통합 라우팅/최소 권한 차단, 승인된 Provider full/partial normalization과 restore, 독립 Provider ordering 정책, 공식 Reader 유료 T2 원자 공개 및 #1941 복원·Product/Commerce/Privacy/Legal/DB Owner 승인 전 Draft/배포·운영 결제/환불 공개 금지.

### D3c exact-SHA PostgreSQL 원자성 최종 검증 (2026-10-13)

- Draft PR #2034의 코드·테스트 SHA `99fa0bda9c0759fcccaf309fbc6cd3704190bc62`, GitHub Actions [38339438218](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38339438218)에서 PostgreSQL 15 DB Authority Core, PostgreSQL 17 dependency, Content dependency, Work Track, CI Verify 모두 PASS. Governance 및 Web PR Domain Gates PASS.
- PostgreSQL15 실행 로그: `PASS D3c: second sorted Grant CAS failure rolled back first Grant revision and event`; `PASS D3c: two independent verified full cancellations atomically COMMIT with two immutable events`; `PASS D3c: replay denied, ledger unchanged, no runtime/Commerce EXECUTE`. Schema catalog `5d646e31f149eb3745646fe44705494b1cf09364f7bc7efb409490b3018e77a4` (86 tables) PASS.
- **D3c PRIVATE 후보의 코드·테스트 검증 완료.** 시험은 동일 Product에 속한 두 별도 verified Provider Event/Receipt/Grant의 실험적 full cancellation이며, 실제 여러 Product 일괄 효과, 취소 금액/부분 환불/정상·역순 ordering의 독립 Provider 조회, Commerce worker 정식 등록, 원본 Writer direct bypass 제거, 복구·사후 정산·법무 정책은 미완료. Draft/병합·운영 서비스/유료 공개 HOLD.

## 23. D3d 별도 Commerce Server 사전 판정 후보 — refund source truth (2026-10-13)

**개발 후보 / HTTP·PortOne 운영 연결 없음 / 법무·운영 승인 전 HOLD.** `apps/api/src/official-reader-provider-cancel-preflight-v1.ts`은 기존 API 코드와 분리된 **순수 읽기 전용 판정 함수**이다. 입력은 외부에서 독립 검증된 서명 웹훅 결과, 독립 Provider API 재조회, verified production Commerce Receipt, 영속 이벤트의 중복·순서 판정, Commerce·Legal 검토 기록의 다섯 출처여야 한다. 전달된 `authority` 문자열은 *검증 증명서가 아니며 임의로 위조할 수 있으므로*, 함수의 `candidate` 출력은 운영 회수 승인이 아니다. **모든 반환값에서** `providerRefundAuthorized=false`, `entitlementMutationAuthorized=false`, `runtimeExecutionAuthorized=false`를 불변으로 둔다.

- 정확한 payment/transaction/receipt ID 및 paid amount/currency 교차 검증, provider 결과가 `CANCELLED` + 누적 취소금액=원결제금액 + 잔액=0인 전액 취소 후보만 `candidate`; 그 외 부분 취소/취소 미완료/위조·누락/서로 다른 Product·회원 연결 후보는 HOLD.
- 서버 소유 DB event-history에서 `isDuplicate=false` 및 `ordering='confirmed_newer'`를 **독립적으로 입증해야** 하며 Provider 원시 ordering key를 임의 문자열 비교하지 않는다. approved Commerce+Legal full cancellation review 증거가 없으면 후보 자체를 HOLD.
- 신규 `tests/official-reader-provider-cancel-preflight-v1.test.ts`: 결제·거래·금액·통화 불일치, partial refund, 중복·stale/unknown ordering, 검증/정책 누락 및 prototype 오염, 완전한 후보조차 **0 mutation 권한**임을 시험한다.
- **운영 사실:** 현행 `apps/api/src/portone-v2-webhook-payment-completion.ts`는 서명 검증 후 `Transaction.Paid` 이외의 원시 type을 `ignored`로 반환한다. D3d는 raw PortOne 취소 이벤트 타입 또는 provider endpoint 구조를 임의로 가정하거나 이를 교체하지 않는다. 추후 정확한 PortOne 공식 이벤트·API 사양 및 자체 Provider API 조회 adapter를 검증한 뒤 서버에서 독립 verified source를 생성해야 한다.
- **미완료:** Provider 실제 refund API 조회/웹훅 인증·취소 유형 정규화, 금액별 부분 취소 영향 분배, 법무·Commerce 정책 최종 승인, 현재 `myeongha_commerce_internal_executor`의 최소권한 분리, 승인 후 1850/1080 실행 연결, direct legacy Writer bypass 차단, #1941 운영 복원, D5 protected T2. 이번 D3d Pure guard 자체는 환불 처리 또는 이를 대신할 충분 조건이 아니다.

### D3d exact-SHA 안전 판정 후보 검증 (2026-10-13)

- Draft PR #2037의 코드·테스트 SHA `ef5b576a648d7986fcc48a6ea2f4ac4ad87d83b0`, [GitHub CI 38340805623](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38340805623): Commerce Payment Work Track, 최종 CI Verify, Governance, Web PR Domain Gates 모두 SUCCESS. TypeScript/빌드 검사 성공. Commerce Work Track의 기존 775 tests PASS / 19 SKIP 및 **D3d 신규 25 tests PASS**를 해당 job의 출력에서 확인.
- 본 작업에는 SQL 마이그레이션이 없다. PostgreSQL 15·17 dependent jobs는 scope router에 의해 SKIPPED이며, 이는 D3c DB 검증이 무효화됐다는 의미도 D3d DB 검증을 새로 수행했다는 의미도 아니다. D3c 1850의 별도 [CI 38339438218](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38339438218) PASS를 그대로 사용한다.
- **D3d PURE HOLD 판정 검증 완료**. raw PortOne 취소 이벤트 서명/실제 provider API 조회·결제금액·부분환불·ordering 증명 인입, approved Commerce actor 연결, payment.cancelled 영속화, SQL 1850 호출, 1080 직접 Writer 우회 통제는 미구현. D3d candidate가 유료 접근 회수 또는 Provider 환불을 authorize하지 못하는 `false` 3종 불변으로 고정. Draft/병합·운영 활성화 HOLD.

## 24. D3e PortOne V2 실제 취소 source 재조회 후보 (2026-10-13)

**공식 문서 확인:**
- https://developers.portone.io/opi/ko/integration/webhook/readme-v2 (버전 `2024-04-25`; `Transaction.CancelPending` / `Transaction.PartialCancelled` / `Transaction.Cancelled`; `data.paymentId`, `data.transactionId`, optional `data.cancellationId`; 재시도 시 webhook `timestamp` 동일)
- https://developers.portone.io/opi/ko/integration/cancel/v2/readme?v=v2 (취소 내역 상태 `REQUESTED`/`FAILED`/`SUCCEEDED`, 부분 취소 지원)
- https://portone-io.github.io/server-sdk/js/types/Payment.PaymentAmount.html (`amount.paid`, `amount.cancelled` 등)
- https://portone-io.github.io/server-sdk/js/types/Payment.CancelledPayment.html (`GET /payments/{paymentId}`의 `status='CANCELLED'`, `cancellations[]`, `statusChangedAt` 등)
- https://portone-io.github.io/server-sdk/js/types/Payment.SucceededPaymentCancellation.html (취소 ID `id`, `status='SUCCEEDED'`, `totalAmount`).

**현재 후보:** `apps/api/src/portone-v2-cancellation-source-v1.ts`은 기존 `authenticatePortOneV2WebhookPaymentCompletionV1`의 원문 서명·timestamp 검증을 이용해 인증된 취소 type만 파싱하고, 서버 보유 API Secret으로 허용된 PortOne GET URL만 읽는다(고정 호스트, redirect 금지, timeout/body 64KiB 제한). Payment/Transaction/Store/TEST-LIVE identity가 서로 다르거나, `cancellations[]` 성공 금액의 합계가 `amount.cancelled`와 다르면 거부한다. `Transaction.Cancelled`에서도 `status='CANCELLED'`·실결제액 전액 누적취소·해당 `cancellationId`의 성공 기록이 있어야 `full_candidate`. 늦게 들어온 `Transaction.PartialCancelled`는 GET 조회 결과가 `CANCELLED`라도 `superseded`로 남긴다. `CancelPending`은 `pending`으로 유지.

**불변:** 반환 `providerRefundAuthorized=false`, `entitlementMutationAuthorized=false`, `requiresDurableOrdering=true`. `full_candidate`는 DB Receipt 검증, 영속 중복/순서 판정, Legal/Commerce 승인 및 1850 원자회수 실행 권한과 별개다. webhook 현행 runtime dispatch는 건드리지 않고, 새 조회 함수를 어떤 운영 actor에도 연결하지 않는다. `cancellationId`는 공식 문서상 optional이지만 이 좁은 계약에서는 없으면 그 취소 사건을 특정할 수 없으므로 fail closed.

**미구현:** 영속적인 Provider event-id/취소-id 중복·역순 원장, authoritative original Receipt 정합, 엄밀한 cumulative partial 분배, trusted worker 통합, 모든 legacy Writer 우회 제거, restore·T2·Legal 승인. D3e 코드를 CI 검증 전 PASS로 판정하지 않는다.

