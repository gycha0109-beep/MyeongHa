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

## 10. S2 실제 기능 구현 — 검증된 Receipt → Grant → Reader 결속 원자 경로 (2026-10-18)

**진행 상태: S2 부분 구현 / 전체 S2 미완료 / 운영·유료 공개 HOLD.** M1-N 형태로 검증 마일스톤을 추가하지 않고 위 §3의 기존 S2 납품 범위를 수행한다.

- 신규 순방향 SQL `1760_official_reader_scope_atomic_receipt_bind_v1.sql`에서 **실제 저장 경로** `internal_apply_verified_reader_purchase_under_scope_v1`를 구현한다. 신뢰된 Subject 문맥과 DB 저장 Receipt·구매 Intent·Reader 선택을 확인한 후 S1의 `internal_acquire_official_reader_scope_lock_v1`로 **Subject×공식 Reading×Reader** 잠금을 먼저 잡는다.
- 같은 PostgreSQL 트랜잭션 안에서 기존 1090 `internal_apply_verified_receipt_capability_effects_v1`로 실제 Capability Grant/Event/Projection/Outbox를 확정하고, 기존 1220 `cmd_bind_standard_reading_access_v2`로 공식 Reading/Reader Access를 결속한다. 저장된 반환 Reading/Reader/구매 Intent가 잠금 범위와 다르면 오류로 **전체 Grant/결속을 롤백**한다.
- API/Public/Service Role에 새 SQL 함수 EXECUTE를 부여하지 않는다. `READ COMMITTED`와 서버 검증 Subject 필수이며, 현재 운영 DB·결제사·환불 API를 호출하지 않는다.
- `test/db/official_reader_s2_atomic_receipt_bind_live_writer_race.sh`는 기존 S2 2세션 경합 fixture를 재사용해 **기존 수동 잠금 테스트 대신 실제 합성 Receipt·Grant·Reader 결속 함수를 호출**한다. T2 먼저→실제 발급 대기/커밋, Reader 묶음 충돌, 회수 먼저→T2 후 현재 권한 재조회가 핵심 인수 조건이다.
- **여전히 미완료:** 원래 `internal_apply_entitlement_effect_v1`의 독립 공급자 회수·환불 Writer, 기존 1090의 직접 호출 경로, 모든 T2·추가 Reader 구매·기타 Commerce 경로에 공통 잠금을 강제한 상태가 아니다. 해당 우회 경로를 닫기 전에는 §3 **S2 완료**나 유료 해설 T2 정합성을 선언하지 않는다.
- S2 전체 종료 전에 각 Writer의 기존 Receipt/Grant/Purchase/Birth 행 잠금과 새로운 범위 잠금의 **전역 획득 순서**를 검토하고, 독립 호출이 가능한 소유자 경로를 제한해야 한다. S3~S8은 원래 로드맵 순서와 소유자 승인을 그대로 따른다.


### S2 기능 추가: Provider 환불 통보 → 이용권 회수 (2026-10-18)

- `1770_official_reader_scope_provider_effect_revoke_v1.sql`: 별도 확인된 **Provider 환불·취소 이벤트**와 해당 구매 Grant의 영수증 출처를 대조한다. DB가 저장한 공식 Reading×Reader 범위를 전부 찾아 **동일 S1 범위 잠금을 정렬된 순서로 획득**하고, 기존 `internal_apply_entitlement_effect_v1`에서 실제 Grant 상태·Entitlement Event·Projection·Outbox를 **원자적으로 취소 또는 만료**한다. 입력으로 구매자·Reader 범위를 임의 선택하지 않는다.
- 새 비공개 함수 `internal_apply_official_reader_provider_revoke_under_scope_v1`는 API/익명/일반 인증/Service Role의 호출을 차단하며, 환불 결제사 API를 직접 호출하지 않는다. 기존 Provider 이벤트가 사전에 저장·검증되어 있어야만 작동한다.
- 기존 `official_reader_provider_effect_revoke_race_preflight.sh`의 **실제 Provider-Event 회수 작업을 새 S2 함수 호출로 교체**해, 회수 선행과 Reader 선행 순서 모두 기존 Grant·Event·Projection 반영이 이루어지는지 확인한다.
- **S2 아직 미완료:** 운영상의 Provider 이벤트 디스패처가 이 진입점을 호출하도록 연결하고, 기존 직접 `1080/1090` Writer 우회 경로·T2 Chat 확정 경로를 통합해야 한다. 통합 전 유료 Reader 공개는 계속 OFF.


### S2 기능 추가: 기존 1080/1090 직접 발급·회수 우회 제한 (2026-10-18 후속)

- **기존 §3 S2 납품 계약에 속하는 실제 코드 변경**이며 새 마일스톤이 아니다. 1790_official_reader_legacy_provider_effect_scope_guard_v1.sql은 기존 1080 Provider Event 회수 함수에 **실제 보유 중인 S1 advisory lock 확인**을 추가한다. Reader 구매 Grant와 결속된 모든 기존 공식 Reading 범위가 잠겨 있지 않으면 Provider/Grant 행을 잠그기 전에 거부한다. 원래 SQL 파일 1080은 직접 수정하지 않는다.
- 1800_official_reader_receipt_grant_prelocked_scope_guard_v1.sql은 기존 1090 검증 Receipt 배치 발급 및 그보다 저수준인 1080 Receipt granted 직접 호출 **양쪽**에 동일 잠금 보유 전제조건을 넣는다. 적용 대상은 현재 공식 Reader Delivery Policy 및 해당 Product/Reader 구매 선택이 있는 Receipt이며, 일반 Commerce 및 과거 별개 Reader 구매 모델을 확장·재해석하지 않는다.
- 기존 공식 Reading이 하나이면 DB에 저장된 Product×Subject의 Reading×Reader를 잠금 키로 확인한다. 새로운 공식 Reading이 아직 없을 때는 S2 1760이 동일 거래에서 선점한 예정 Reading을 거래 로컬 문맥으로 전달한다. 1090/1080은 **그 문맥만 믿지 않고** PostgreSQL pg_locks에 실제 advisory lock이 잡혀 있는지 확인한다. 1760은 발급과 결속 후 Reading/Reader 일치까지 확인하고 불일치 시 원자 롤백한다. 여러 공식 Reading이 발견되면 단일 Reading을 임의로 선택하지 않고 거절한다.
- 합성 DB 시험은 기존 1090 Reader 구매 fixture를 **명시적 같은 거래의 실제 S1 잠금** 아래 실행하며, 1080 최초 Grant·1090 직접 호출·1080 Provider Effect 무잠금 우회를 각각 부정한다. 1790/1800에 의해 기존 Outbox 생산자 함수의 정의가 재배포되는 것은 탈퇴·삭제 preflight의 실제 Outbox 생산자 파일 목록에도 포함했다.
- **S2 종료 전 미해결:** 독립적인 cmd_bind_standard_reading_access_v2 (1220) Reader 결속 명령은 아직 새 잠금의 강제 경계가 아니고, 미결의 최초 Reading 생성/다중 Reading 전역 잠금 순서 문제도 소유자 검토 대상이다. S3 공식 Saju 출처 발행과 S4 Privacy 승인된 보호 본문/메모리 격리 저장이 없으므로 **S5 실제 유료 본문 최종 저장 T2는 구현/활성화하지 않는다**. 기존 일반 Chat cmd_commit_chat_turn_v1에 유료 원문을 저장하지 않는다. Draft, PUBLIC OFF, 운영 DB 변경·실결제/환불 금지를 유지한다.
