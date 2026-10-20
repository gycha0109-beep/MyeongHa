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
- **이후 1810에서 변경:** 독립적인 cmd_bind_standard_reading_access_v2 (1220) Reader 결속 명령도 Reader 범위 잠금을 실제로 획득하는 필수 경계로 연결했다. 다만 최초 Reading 다중 Writer의 전역 잠금 순서와 기타 미통합 Writer 경로 검토는 여전히 S2 종료 조건이다. S3 공식 Saju 출처 발행과 S4 Privacy 승인된 보호 본문/메모리 격리 저장이 없으므로 **S5 실제 유료 본문 최종 저장 T2는 구현/활성화하지 않는다**. 기존 일반 Chat cmd_commit_chat_turn_v1에 유료 원문을 저장하지 않는다. Draft, PUBLIC OFF, 운영 DB 변경·실결제/환불 금지를 유지한다.


### S2 기능 추가: 1220 직접 Reader 결속 Writer 공동 잠금 강제 (2026-10-18 후속)

- 1810_official_reader_direct_bind_shared_scope_lock_v1.sql에서 **기존 실제 1220 cmd_bind_standard_reading_access_v2 정의를 순방향 재정의**했다. 공개 함수나 별도의 느슨한 Writer를 만들지 않는다. 모든 기존 호출(초회, 추가 Reader, 정상 재생 포함)에 대해 Receipt/Grant/Purchase/Birth 행 잠금을 수행하기 **전에** 원본 DB의 구매 Intent·Product Offer·immutable Reader 선택·현재 공식 Reading Identity(또는 이미 저장된 접근 결속)를 조회하여 정확한 Subject × Official Reading × Reader **S1 advisory transaction lock을 먼저 취득**한다.
- 최초 공식 Reading이 아직 없을 때만 신규 Reading proposed ID를 잠금 범위로 사용하며, 최초 Reading 생성 결과가 잠근 범위와 다르다면 오류·원자 롤백한다. 기존 공식 Reading은 생성 요청의 proposed ID가 아니라 **DB에 저장된 실제 공식 Reading**을 기준으로 잠근다. 추가 Reader 구매·과거 요청 재생은 별도 새 범위를 만들어 잠금을 우회할 수 없다. 기존 1760가 같은 거래에 전달한 예정 Reading ID와 서버가 재해석한 공식 Reading이 불일치하면 이중 범위 잠금을 획득하기 전에 실패한다.
- 1220의 기존 단일 결속, 단일 Grant, 정확한 Saju 출처, 1개 official Reading 재사용, immutable Reader access, idempotent replay의 모든 원래 의미를 유지한다. Public/Service/API EXECUTE, 유료 Reader 공개, 운영 DB 마이그레이션은 추가하지 않는다.
- test/db/official_reader_new_grant_insert_phantom_preflight.sh의 기존 DB-C4는 더 이상 무잠금 1090을 허용하는 회귀 예외가 아니다. B4 발급도 직접 S1 범위를 선잠근 뒤 생성하며, 독립적인 B2 FOR SHARE **행 잠금만으로는 다른 Grant 삽입을 막을 수 없다는 근본 시험**은 유지한다. 신규 별도 연결 경합에서는 **다른 거래가 S1을 보유한 동안 직접 1220 replay도 advisory lock에서 반드시 대기**하고 해제 뒤 동일 Reader 접근 권한을 중복 생성 없이 재생해야 한다.
- **S2 상태:** 실제 1760 발급+결속, 1770/1780 Provider 회수, 1790 Provider 직접 Effect, 1800 legacy Receipt 발급, 1810 직접 Reader 결속의 **핵심 DB Writer들은 공통 잠금에 참여**한다. 다만 S2 전체 Writer 목록·전역 잠금 순서·운영 복구 승인 없이 완료 승인하지 않는다. **S3 공식 Saju 근거 출처 및 S4 보호 본문/Memory 격리 선행 계약이 없어 S5 유료 본문 최종 원자 저장(T2)은 여전히 금지.** 일반 Chat 메시지에 유료 원문을 억지로 삽입하지 않는다.


### S3/S4 초기 기능과 실제 인계 (2026-10-18 후속)

- `apps/api/src/official-reader-s3-source-coverage-preflight-v1.ts`: 현재 DB가 허가한 공식 Reading에서 보호된 원본의 정확한 Source Unit ref/hash를 산출하고 선택·동반 근거·공시·모호성·Semantic/Output 검증 후보를 대조한다. 잘못된 Reading, 누락, 중복, 변조, 다른 원본 해시를 거부하는 TypeScript 음성 시험을 동봉했다. **형식적 통과도 `held`, Source/Semantic/Output Authority `NOT_EVALUATED`, 공개 false**다. Saju Owner가 공식 출처 발급·서명·진위 계약을 제공할 때까지 S3 완료가 아니다. 기존 signed Preview transport proof도 공개 권한으로 사용하지 않는다.
- S4 실코드 위험면·Privacy/Chat/Saju/DB/Legal 인계: `docs/architecture/OFFICIAL_READER_S3_S4_SOURCE_AND_PRIVACY_HANDOFF_20261018_V1.md`. 일반 Chat 본문·생성 시도·Reader 최근 메시지·장기 기억·후속 분석·Outbox·로그를 확인해야 하며 신규 개인정보 보관 테이블/보존 규칙은 **Privacy 사전 승인 전 생성 금지**.
- **S5 원자 T2 본문 저장 / S6 재열람 / S7 공개: 계속 미구현·차단**. S3/S4 정적 검사와 위험 감사 문서만으로 공개/정식 출처/유료 권한이 생기지 않는다. 기존 S0~S8 단계·승인 범위·운영 복구 HOLD 유지.


### S3 후속: 독립 서명 인계 실험 (2026-10-18)

- `apps/api/src/official-reader-s3-saju-owner-handoff-rehearsal-v1.ts`는 **합성 서명**을 쓰는 비공개 Saju Owner 인수 측 검증기다. Saju Owner의 실제 승인된 발행 API/서명을 대체하지 않는다. S3 Unit 구조 검사 후 Subject×Reading×Reader×Bundle×Release×공식 원본 hash와 전체 Unit 후보 digest에 묶인 별도 domain HMAC, 발행 유효기간, 분산 재생 방지 nonce를 검증한다.
- 검증의 성공과 실패는 각각 `held`/ `blocked`만 반환하며 둘 다 `sourceAuthority: NOT_EVALUATED`, `privacyApproval: NOT_EVALUATED`, `publicDisclosureAuthorized: false`; 본문, hash, 회원/Reading ID 등 개인정보·원문을 반환하지 않는다. 생성/유료 결제/응답/DB/Memory/Outbox와는 연결하지 않는다.
- 교차 회원/Reading/Bundle/Release, 변경된 공식 원본, 조작된 Unit, Preview proof 오용, 기한 만료, nonce 재사용, 분산 nonce 저장소 장애를 합성 공격 시험한다. **실제 Saju Owner 및 Privacy Owner의 계약·승인이 없으므로 S3/S4/S5 완료라고 선언하지 않는다**. S5 원자 T2 저장과 출시 금지 유지.


### S3/S4 선행 차단 보강: 정확한 출처 범위와 전송 객체 거부 (후속)

- S3 합성 Owner 인계 검증은 기존 Subject×Reading×Reader×Bundle×Release 외에 **Thread/Content Revision/Product/Spec/Domain/Reading Contract/Rule/Approved Policy**를 현재 서버 결속값과 비교한다. 후보가 실제 독립 서명으로 바뀌어도 한 항목의 변경·교차 적용을 거부하는 부정 시험을 추가했다. 성공 결과도 `held`, 실제 공식 발행/유료 사용권 **NOT_EVALUATED**다.
- S4 내부 `runOfficialReaderHeldT1T2PreflightV1` 생성 반환값의 직접 HTTP `Response`·`Request`·스트림·`Blob`·`FormData` 형태를 일반화된 오류로 거부하고, T2 이전 유출형 결과 차단 시험을 추가한다. 기존처럼 생성 본문·해시·원본 식별자는 반환/저장하지 않는다. 생성 콜백 부작용(로그/기억/Outbox 등)은 별도 Privacy/Chat 감사가 필요한 미해결이므로 **S4 완료 아님**.
- **S5 유료 원자 T2·보호 본문 보관/삭제/복원·S6 재열람·S7 전달을 승인하거나 구현한 것이 아니다.** Owner 승인 전 운영 DB/실결제/공개 OFF, PR Draft 유지.


### S4 보호 데이터 실제 반환형 차단 및 기존 Privacy 정책 정합성 인계

- `official-reader-held-t1-t2-preflight-v1.ts`의 T1 종료 뒤 비공개 생성 결과는 최상위/중첩 모두 HTTP Response/Request/Stream/Blob/FormData, Buffer, Error, Promise, 콜백/getter 및 순환·과도한 중첩 구조이면 별도 T2 진입 전에 일관된 오류로 실패한다. 제한된 일반 JSON형 개인 Draft는 기존처럼 폐기하고 HOLD만 반환한다. 코드/합성 시험만 변경하며 실 HTTP·Message/Attempt/Memory/Outbox에 유료 본문을 쓰지 않는다.
- Privacy Source of Truth는 `docs/operations/ACCOUNT_DELETION_FINALIZATION_POLICY_V1.json`의 P0-PR-01: 현행 `destructiveRuntimeAuthorized: false`, `authoritativePrivacyReconciliation: false`, `drReady: false`, P30D 백업·Commerce P5Y 법적 근거 보관이다. 기존 RR-03 [#1960](https://github.com/gycha0109-beep/MyeongHa/pull/1960) Draft는 **출처 이력만** 다루므로 유료 본문 원문 저장 승인으로 승격하지 않는다. Saju proof nonce DB 1540은 Preview 전용이며 신규 S3 서명 권한이 아니다.
- `OFFICIAL_READER_S3_S4_SOURCE_AND_PRIVACY_HANDOFF_20261018_V1.md`에 유료 본문·생성 시도·출처·Memory/검색/요약·안전 표시·백업 복원별 **데이터 분류/삭제/복원 실물 증거**를 Owner 인수표로 명시했다. 현재 신규 보호 데이터 테이블 및 실제 유료 생성/저장/공개 기능은 미구현, S3·S4 Owner 정식 승인 전 S5 원자 저장 구현/출시 차단.


### S3 실제 Reader 인가 Source → 공식 v2 근거 Closure 연결 (2026-10-19)

- `apps/api/src/official-reader-s3-authoritative-artifact-coverage-v1.ts`에서 비공개 Reader Admission Scope와 실제 DB 인가 `CharacterStandardReadingKnowledgeSourceV1`의 회원·Reading·Reader·Bundle·Product·Spec·Domain·Reading Contract·원본 fingerprint를 교차 확인한 다음, 원본 공식 `ProductReadingResponse v2`의 보호 Segment·필수 Disclosure·Ambiguity를 **기존 도메인 Projector로 직접 생성**하여 S3 후보 근거 해시·출처 목록의 완전성을 대조한다.
- 보조 증거 객체만 받아들이던 S3 구조 검사에 비해 실제 서버 인가 Source에서 출발하는 경로를 추가했다. 합성 시험은 교차 회원·Reader·상품·원본 변경/가짜 원본/partial fallback/누락된 근거·고지·모호성을 거부한다.
- **실제 Saju Owner 발행 증명, Semantic/Output Guard 및 Privacy Owner 보호 본문 승인 전에는 이 경로도 무조건 HELD/BLOCKED만 반환**한다. 영구 저장·RLS 권한·HTTP·일반 Chat Writer·유료 응답을 추가하지 않는다. Saju #2410, Privacy #2318의 인수·승인 조건은 여전히 유효하다.


### S3 실제 Saju 서명 Preview 응답과 공식 DB 원본 대조

- `official-reader-s3-signed-source-artifact-reconciliation-v1.ts`는 **실제 Saju 서버 전용 발급기의 signed Preview envelope**를 기존 암호학적 검증기·원자 nonce ledger로 검증하고, DB에 인가·고정된 공식 ProductReadingResponse v2 원본의 canonical hash 및 Reading ID와 비교한다. 같은 Preview 서명이 유효해도 **DB에 저장된 해설 원본과 다르면 거부**한다. 필수 근거·동반/고지/모호성은 신규 `official-reader-s3-authoritative-artifact-coverage-v1.ts`를 통해 먼저 검증한다.
- 공식 Production Source attestation은 Saju #2410에서 여전히 미발행, 신규 개인정보 유료 원문 보존·삭제·복원 승인은 Privacy #2318에서 미결이다. 이 연계는 **Preview 전송 무결성 + 원본 일치 확인**일 뿐 Official Source Authority·Semantic/Output PASS·S5 유료 본문 최종 원자 저장을 제공하지 않는다. 비공개 시험, `held/blocked`, PUBLIC OFF/Draft/운영 DB 미적용 유지.


### 최종 저장 선행 권한 조회의 오래된 DB 스냅샷 차단 (2026-10-19)

- S2 1750 `internal_qry_official_reader_locked_bundle_scope_v1`를 1820 순방향 migration으로 보강했다. 현행 구매권을 읽는 함수에서 **`READ COMMITTED`가 아니면 공동 잠금을 획득하기 전 PostgreSQL 오류**를 발생시킨다. 오래된 `REPEATABLE READ` / `SERIALIZABLE` 트랜잭션의 최초 스냅샷으로 환불/회수 후에도 과거 구매권을 다시 유효하게 판단하는 위험을 차단한다.
- 기존 실제 S2 발급·회수 경합 preflight에 두 격리 수준의 부정 시험을 추가했다. 정상 READ COMMITTED 조회, 단일/다중 Bundle과 권한 회수 결과 검증은 기존 그대로 유지한다.
- 이는 최종 T2가 요구하는 **잠금 뒤 최신 구매권 조회**의 선행 조건일 뿐, T2 유료 본문 저장/공개 권한이 아니다. Saju 공식 Production 출처 발급 [#2410](https://github.com/gycha0109-beep/Saju/issues/2410) 및 Privacy 신규 보호 본문 승인 [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318)은 둘 다 여전히 열려 있다. 실제 유료 본문·Memory·일반 Chat·운영 DB/결제 경로 변경 없음, Draft·PUBLIC OFF 유지.


### S5 비공개 최종저장 전 권한 관문 — 계약 미승인 시 보류 (2026-10-19)

- `1830_official_reader_s5_precommit_held_scope_gate_v1.sql`에서 비공개 `internal_qry_official_reader_s5_precommit_held_scope_v1`를 구현했다. 기존 1740/1820이 강제하는 **같은 Subject×공식 Reading×Reader 거래 잠금**, `READ COMMITTED` 및 잠금 뒤 DB 현행 구매 Grant 묶음 조회를 **최종저장 선행 진입점에 직접 연결**한다.
- 서버가 기대한 Reader Bundle UUID와 잠금 뒤 실제 유효 Bundle이 다르거나, 0개/2개 이상 활성 Bundle이면 `blocked`; 정확히 1개이고 동일 Bundle이어도 **`held`와 `can_persist=false`, `can_disclose=false`만 반환**한다. 본문·해시·출처·회원식별자 반환 없음. Saju Owner [#2410](https://github.com/gycha0109-beep/Saju/issues/2410) 공식 Production 원본 발행과 Privacy Owner [#2318](https://github.com/gycha0109-beep/MyeongHa/issues/2318) 보관·삭제/복원 계약 부재를 긍정으로 우회하지 않는다.
- 기존 `official_reader_s2_atomic_receipt_bind_live_writer_race.sh`의 **실제 Receipt→Grant→Reader 결속, B4 추가 구매, 2개 Bundle 충돌, B4 회수, 최종 B2 회수** 상태마다 이 관문을 호출한다. 다중 Bundle 및 환불/회수 뒤에도 저장·공개 권한은 0이고, 정상 1개여도 Owner HOLD임을 확인한다. 일반 Public/API/Service/Chat/Commerce 역할에 새 EXECUTE가 없다.
- **이것은 실제 유료 본문 저장·출처 발행·Privacy 승인·T2 commit이 아니다.** 함수에서 보호 테이블/출처 증명을 쓰지 않고, 운영 DB/실결제·일반 Chat/Memories/Outbox/HTTP를 변경하지 않는다. 실제 S5 Writer는 공식 발행과 Privacy 승인·S2 전체 Writer/전역 잠금 순서·릴리스 심사를 충족한 뒤에만 별도 구현한다.


### S2 후속 실제 결함 수정 — 출생정보 개정 후 과거 Reading 잠금 오인 방지 (2026-10-19)

- **발견된 결함:** 기존 1800 발급 잠금 확인은 Subject×Product의 *전체 과거* 공식 Reading 수를 집계했습니다. 출생정보 개정으로 동일 상품의 새로운 공식 Reading이 필요한 첫 구매가 과거 원문 Reading을 잠그거나, 과거 여러 개가 존재하면 정상 발급을 거부할 수 있었습니다.
- **실제 수정:** 순방향 `1840_official_reader_receipt_exact_revision_scope_guard_v1.sql`에서 **기존 1090/1080의 호출 함수** `internal_assert_reader_receipt_scope_prelocked_v1`를 그대로 재정의합니다. 구매에 이미 결속된 접근은 그 불변 Reading을 사용하고, 미결속 구매는 현재 Birth Revision×Product Spec×Saju Domain Capability의 정확한 공식 Reading만 선택합니다. 해당 Reading이 없는 *첫 구매*는 1760이 잠근 예정 Reading만 허용하며 추가 Reader 구매는 신규 Reading을 임의 생성하지 않습니다. 같은 S1 advisory lock 확인, 사전 READ COMMITTED, 기존 Commerce 비-Reader 경계 및 실행권은 유지합니다.
- **실제 회귀:** 기존 `test/db/official_reader_s2_atomic_receipt_bind_live_writer_race.sh` fixture 끝에서 최초 Reading의 기존 구매 내역을 유지한 채 Birth revision을 갱신하고, 새 첫 구매가 새 Reading 범위 잠금에서만 허용되고 **이전 Reading 잠금은 거절**되는 PostgreSQL 실험을 추가합니다.
- **계속 HOLD:** S2 전체 Writer 전역 잠금 순서/운영 증명은 여전히 미완료입니다. Saju #2410 공식 Production 출처, Privacy #2318 신규 보호 원문 삭제·복원 승인 전 S5 실제 저장·공개/운영 DB 변경·실결제 금지; Draft PR 유지.


### S2 직접 결속의 오래된 스냅샷 및 잠금 대기 중 만료 판정 차단 (2026-10-19)

- 기존 1810의 신규 Reader 결속은 최초 Grant 유효성 검사 시 잠금 대기 전 `transaction_timestamp()`를 사용했고, 1220 독립 호출은 `REPEATABLE READ`/`SERIALIZABLE`에서 환불 이전 스냅샷으로 읽을 수 있었습니다. 독립 Reader Writer가 신규 Grant 결속에 오래된 권한 상태를 적용할 위험입니다.
- 순방향 `1850_official_reader_binding_replay_current_right_and_fresh_clock_v1.sql`은 직접 1220 진입점에서 `READ COMMITTED`를 필수로 하고, S1 잠금 및 Grant 행 잠금 이후 `clock_timestamp()`로 유효기간을 재판정합니다. **기존 결속의 멱등 재생은 불변 이력 반환만 허용**하며, 실제 접근은 별도의 런타임 구매권 조회가 검증한다는 기존 계약을 변경하지 않습니다.
- 실제 PostgreSQL 두 세션 Writer·T2 경합에 직접 1220의 반복읽기·직렬화 스냅샷 거부 회귀를 추가합니다. 공식 Source #2410 및 개인정보 #2318 승인 전 유료 본문 S5 저장·공개/운영 DB 적용 금지, Draft 유지.


### S2 신규 Reader 결속 최종 확정 직전 구매권 재판정 (2026-10-19)

- 발견: 기존 1850은 S1 범위 잠금과 Grant 행 잠금 직후에는 `clock_timestamp()`로 만료를 재판정하지만, 이후 Birth 행 잠금 대기·공식 Reading 생성·Reader 접근 INSERT 사이에 시간이 지나면 **구매권 만료 후 새 결속이 성공**할 수 있습니다. S1 advisory lock은 환불 Writer를 직렬화할 수 있어도 시계 기반 만료를 정지시키지는 않습니다.
- 순방향 `1860_official_reader_bind_final_current_grant_guard_v1.sql`에서 **새 Reader Access INSERT 이후 성공 반환 전** 정확한 구매 Grant의 현재 active/유효기간 및 Production verified Receipt/원 구매 일치를 재검증합니다. 만료·회수된 경우 예외로 전체 거래를 원자 롤백합니다. 이전 구매의 **불변 결속 재생은 기존 이력 조회 전용 계약 그대로 보존**하고, 실제 접근권 확인은 런타임 별도 경로가 담당합니다.
- 기존 B5 신규 Birth Revision/Reading 실 PostgreSQL 시험에 **Access INSERT 지연 3.5초 동안 2초짜리 검증 구매권 만료** 시나리오를 추가하고, Reading·Grant·결속 0건 롤백을 확인합니다. 테스트 트리거는 정리하며 실제 운영 데이터/유료 보호 본문·공개 경로 변경 없음. Saju #2410, Privacy #2318 승인과 전체 S2 종료 조건은 계속 HOLD입니다.


### S2 유료 Reader 결속 전 verified PortOne 무발급(Zero-Grant) 취소 경합 (2026-10-19)

- 결함: 기존 1780은 이미 공식 Reader access가 결속된 경우에만 Scope를 찾아 full cancellation을 처리하고, 아직 **구매 Grant가 단 한 건도 발급되지 않은 검증된 결제**는 `official_reader_portone_cancel_access_not_yet_bound`로 차단했습니다. 결속 전에 정상 취소가 발생하면 원래 Receipt를 닫을 안전한 코드 경로가 없었습니다.
- 순방향 `1870_official_reader_unbound_zero_grant_cancel_purchase_lock_v1.sql`은 내부 1760 Receipt→Grant→Bind Writer와 PortOne 취소가 동일한 Purchase ID 기반 xact advisory lock을 **S1 및 Receipt/Grant 행 잠금보다 먼저** 취득하도록 정렬합니다. 검증된 PortOne 원결제·전액 취소 증거를 재검증한 뒤 **해당 구매의 모든 영수증에 Grant가 0건이고 Reader 결속도 0건**인 경우, 원래 Receipt를 `FOR UPDATE`로 잠가 독립 1080/1090 Writer와 충돌을 직렬화하고 검증된 ProviderEvent 기록 + Receipt revoked를 원자 확정합니다. 같은 취소 증거 재생은 이벤트를 중복 발급하지 않습니다.
- **Grant가 한 건이라도 발급됐으나 아직 Reader access가 없는 구매는 승인된 정산/Scope Authority가 없어 HOLD/거절**합니다. 정상 결속 완료 건의 기존 1770 Grant/Event/Projection 회수 Writer는 유지합니다. 직접 1220 Reader 결속 및 기존 1080/1090는 신규 Purchase Lock에 재진입하지 않아 기존 S1→Grant/Receipt 잠금 역전은 만들지 않습니다.
- 실제 PostgreSQL 두 세션 경합으로 무발급 취소가 Purchase 잠금을 선점하고 결속 Writer가 대기한 뒤 취소된 영수증으로 발급을 거부하는지, Grant·ReaderAccess·Reading이 0건인지, ProviderEvent 멱등성이 유지되는지 검증합니다. 이 작업은 Draft/격리 DB 전용이며 Saju #2410/Privacy #2318 승인 전 보호 본문·공개·운영 DB 배포 금지 유지.


### S2 미결속·발급 완료 Reader 구매권의 검증된 취소 및 결속 경합 (2026-10-19)

- 이전 1870은 Reader access 미결속 구매의 verified full cancellation에서 Grant가 1건 이상 발급된 경우 전체 취소를 HOLD했습니다. 신규 1880은 **구매 잠금 후 영수증 FOR UPDATE → 해당 영수증의 모든 구매 Grant FOR UPDATE**를 결정적 순서로 취득하고 Reader 결속이 새로 생겼는지 재확인합니다. 이미 결속된 경우 잠긴 Receipt/Grant 이후에 S1 잠금을 뒤늦게 잡지 않고 트랜잭션을 실패시켜 새로운 정상 결속 환불 경로의 재실행만 허용합니다.
- 원 결제 영수증 외 다른 영수증의 Grant가 연결됐으면 무조건 거부합니다. 정확한 미결속 구매권만 기존 1080 `internal_apply_entitlement_effect_v1`으로 `revoked` 처리하고 **원본 EntitlementEvent·Projection·Outbox·receipt status·검증된 ProviderEvent**를 한 트랜잭션에서 일치시킵니다. 이전 1790의 미결속 직접 효과 우회 거부는 유지하며, 실제 동일 구매 advisory lock과 검증된 취소 전용 transaction-local context를 함께 증명한 호출만 예외적으로 허용합니다. 정상 결속 거래는 기존 1770을 유지합니다.
- 실제 PostgreSQL 두 세션 시험에서 미결속 상태로 정상 발급된 Grant가 있는 구매에 취소가 먼저 오면 독립 1220 결속이 **Grant 행 잠금을 기다린 후 거부**되는지, Receipt/Grant revoked, Provider/Entitlement 이벤트 정확히 1회, 반복 취소 시 revision 변경 없음, 직접 무잠금 레거시 효과 차단을 확인합니다. 승인 미확보 S3/S4/S5 및 운영 DB 활성화 금지는 유지합니다.


### S2 역방향 Reader 결속 선점 경합 (2026-10-19)

- 추가 실제 PostgreSQL 동시성 증명: 미결속 B7 Grant에 대해 독립 1220 결속이 `FOR UPDATE`를 선점해 정상 Reader Access를 확정하는 동안 PortOne 취소가 Receipt 잠금 후 Grant 행 잠금에서 기다립니다. 신규 1880은 대기 후 생긴 Access를 확인하고 **S1 잠금을 뒤늦게 취득하지 않고 트랜잭션을 취소**합니다. Verified 취소를 다시 실행하면 이미 존재하는 결속 범위를 먼저 S1 잠그고 1770 정식 Entitlement 회수 경로로 처리합니다.


### S2 동일 구매의 복수 영수증·Grant 환불 증빙 분리 및 발급 경합 (2026-10-19)

- 기존 1880은 같은 구매에 다른 Receipt의 Grant가 존재하면 원 결제 환불도 `official_reader_portone_cancel_other_receipt_grant_held`로 거부했고, PortOne 원거래 탐색 시 `provider_request_id`와 `external_transaction_id`를 **하나의 결제 시도에서 동시 대조하지 않아** 다른 영수증의 paymentId가 취소 권한으로 오용될 수 있었습니다.
- 순방향 `1890_official_reader_exact_receipt_multi_payment_cancel_v1.sql`은 원 거래 검색에서 PaymentAttempt의 `provider_request_id=p_payment_id` **및** `provider_transaction_id=p_transaction_id`를 함께 검증합니다. 검증된 원본 Receipt의 행 잠금·해당 영수증 source Grant의 정렬 잠금·기존 Commerce 1080 이벤트·Projection·Outbox 갱신만 유지하고, 동일 purchase의 **다른 영수증 Grant는 독립 결제이므로 건드리지 않습니다.** 대상 Receipt에 구매 접근이 확정된 경우는 기존 bound S1 회수 경로와 S1 정렬 규칙을 그대로 따릅니다.
- 실제 PostgreSQL B8 합성 경합은 하나의 구매에 별도 검증된 결제 시도 3건/Receipt 3건, 처음부터 분리된 Grant 2건을 보유하고, 다른 영수증의 paymentId를 이용한 환불이 거절되는지 확인합니다. A 영수증 취소와 C 영수증 독립 Grant 발급을 동시 수행하여 **A만 revoked, B/C는 active, 원 Event 단일, 형제 Grant에는 해당 이벤트 0건**을 증명합니다. Saju #2410, Privacy #2318 승인 없이 Production 데이터·유료 본문·공개 경로는 변경하지 않습니다.


### S4 개인정보·법률 신규 승인 검토안 (2026-10-19)

- 기존 P0-PR-01 계정 삭제·Commerce P5Y·백업 P30D와 RR-03 이미 승인된 **출처 provenance DELETE**는 새 원문 보관 권리로 확대하지 않습니다. [S4 별도 신규 승인 제안서](OFFICIAL_READER_S4_PRIVACY_LEGAL_POLICY_APPROVAL_PROPOSAL_20261019_V1.md)에서 보호 원문/청크, T2 이전 임시 생성, 출처 proof, Chat 안전 표시, 로그, AI Memory/검색·벡터 파생물, 백업/복원을 분리해 Privacy/Legal Owner 결정을 요청합니다.
- 개인정보 보호법 제15·21·23·26·28조의8·29·30조, 전자상거래법·시행령 제6조, 인공지능기본법 제31조 및 개인정보위 생성형 AI 지침을 근거로 한 **초안이며 OWNER NOT APPROVED**. 실제 AI/호스팅 수탁자·국가, 처리근거 및 새 데이터별 보존/삭제 SLA는 미확정입니다. S4 승인·DB populated-row/복원 비재노출 증거·S3 Production Source가 준비되기 전까지 유료 원문 영속 저장·공개/운영 DB 적용 금지.


### S4 신규 유료 해설 개인정보 정책 제품 승인 기록 (2026-10-19)

- 사용자 직접 지시로 기존 [S4 법률·정책 제안](OFFICIAL_READER_S4_PRIVACY_LEGAL_POLICY_APPROVAL_PROPOSAL_20261019_V1.md)의 D1·D2·D3·D5·D6 처리 방향과 **본 DB 24시간 파기 목표·원문 없는 일반 운영 로그 90일 상한**을 **제품 책임자 승인**으로 기록했습니다. [별도 결정문](OFFICIAL_READER_S4_PRODUCT_OWNER_PRIVACY_POLICY_DECISION_20261019_V1.md) 참조. 신규 원문 처리 외부 업체는 현 시점 **없다는 사용자 진술**로 기록하며 **실제 인프라 감사 및 외부 원문 전송 승인 불포함**.
- P0-PR-01 기존 P5Y Commerce·P30D 백업·RR-03 출처 DELETE 정본 무변경. #2318은 실 DB FK/RLS/탈퇴 삭제/복원, 현행 외부 데이터 흐름, 법률·약관·AI 고지 인수가 끝날 때까지 OPEN입니다. S5 T2 보호 원문 영속 저장, 공개, 실제 결제, 운영 migration 또는 PR merge 권한을 부여하지 않습니다.


### S4 보호 원문 비공개 저장·삭제·복원 설계 착수 (2026-10-19)

- [S4 보호 데이터 저장 구조/권한/삭제·복원 설계](OFFICIAL_READER_S4_PROTECTED_CONTENT_STORAGE_DELETION_RECOVERY_DESIGN_V1.md)를 추가했습니다. 기본 브랜치 `P0-PR-02` [제품 정책 정본](../OFFICIAL_READER_S4_PRIVACY_POLICY_DECISION_V1.md)을 유일한 정책 권한으로 사용하고 이 설계는 실행 SQL 또는 추가 제품 승인이 아닙니다.
- 기존 일반 Chat `conversation_messages`와 원문 분리, Reader/Reading/Bundle/current Grant 별도 Query, 기존 1520 계정 삭제 최종화에 대한 자식 삭제 순서, 24시간 본 DB 파기 목표/P30D 백업의 격리 복원, 90일 비민감 로그 상한, S3/S5 및 개인정보 실검증 게이트 정리. 운영 DB migration·유료 원문 저장/공개 권한 없음.

### S2 독립 Receipt 환불 범위 보정 (2026-10-20)

- `1900_official_reader_receipt_local_unbound_cancellation_v1.sql`은 과거 1880/1890 migration을 수정하지 않고, 동일 Purchase의 **다른 Receipt**가 이미 Reader에 결속된 경우에도 **취소 대상 미결속 Receipt**에 한정해 검증된 환불을 처리하도록 내부 검사를 순방향 교체합니다. 취소 대상 Receipt를 직접 결속한 경합은 기존 Receipt/Grant 행 잠금 후 롤백·공동 잠금 재시도 규칙을 유지합니다.
- 기존 S2 독립 PostgreSQL 2연결 경합을 PostgreSQL 15·17 공통 CI에 연결하고, 실제 FK가 강제하는 합성 B 결속 상태를 추가해 미결속 A 환불과 독립 C 발급 경쟁을 재현했습니다. 별도의 B7 시험은 실제 1220 결속·환불 경합을 유지합니다. A만 취소하고 B의 결속·권리, C의 발급을 유지하는 것이 인수 조건입니다.
- **S2 전체 종료 아님.** S3 Production 출처 증명, S4 기술/법무 인수·실보호 테이블·삭제/복원, S5 유료 T2 원자 저장, 공개/운영 적용 모두 HOLD입니다. PR Draft 상태를 유지합니다.

### S2/S4 후속 격리 검증 (2026-10-20)

- 기존 S2 PostgreSQL 15·17 실경합에서 결속된 B와 살아 있는 C가 있는 동일 구매의 **미발급 D 영수증 전액 취소·중복 재생**도 검증합니다. D만 취소, B/C Grant·Reader 결속 보존, 증빙 이벤트 정확히 1건이어야 합니다.
- 기존 S4 보호 저장소 격리 시험에 `\\copy`를 통한 **오래된 합성 행 논리 복원 2회**, 백업 외부 삭제 tombstone/복원 epoch 기반 재노출 차단 및 실제 Chat 자식 우선 정리 검증을 연결했습니다. 전용 테스트 원장은 운영 복원 원장이 아니므로 복원/P30D 인수 완료가 아니며 S3·S4 승인 범위와 S5~S8 HOLD 불변입니다.

### S2 구매 잠금 시간 초과·S4 계정 삭제 FK 실증 (2026-10-20)

- S2: 구매 advisory lock이 다른 연결에 잡힌 동안 D 영수증 verified cancellation은 lock_timeout으로 트랜잭션 전체 실패·Receipt/Provider Event/형제 Grant 변경 0, 잠금 해제 후 동일한 D 취소·재시도만 한 번 반영되는지 검사합니다.
- S4: 1520 계정 삭제의 첫 Reader-access 부모 DELETE가 합성 보호 행 FK로 차단되고, 보호 행 물리 삭제 후 허용되는지 PostgreSQL 15/17·논리 복원 시험을 검증합니다. 운영용 최종화 함수 재정의 및 Privacy/Legal·백업 인수는 HOLD입니다.

### 다음 계약 검증: S2 전역 잠금 교차, S4 1520 최종화 삽입점 (2026-10-20)

- `tests/official-reader-s2-s4-lock-and-delete-contract.test.ts`는 실제 1870/1900의 **구매 advisory → 정렬된 Reader S1 → Receipt/Grant 행**과 1810 직접 Reader binder **S1 → Purchase/Grant/Birth 행**, 1770 verified event dispatch **전체 S1 정렬 → Grant** 순서 및 1520 Reader-access-first 삭제를 소스 드리프트 계약으로 검사합니다. CI PostgreSQL 15·17 실제 2연결에서는 **구매 advisory 대기 중 S1 보유자의 Purchase row FOR UPDATE**가 순환 대기로 바뀌지 않는지 검증합니다.
- S4의 비운영 순방향 삭제 표본은 실제 1520 정의 검토와 별도 시험 SQL에서 **protected child → Reader-access parent** 순서를 성공시키고 rollback/Commerce 보존을 확인합니다. 실제 계정 삭제 함수·유료 본문·KMS·정식 개인정보 삭제 Worker·운영 DB에는 반영하지 않았으며 S2 완전 종료, S3/S4 기술 인수, S5~S8은 여전히 HOLD입니다.
 
### 추가 S2/S4 복합 오류·잠금 경계 시험 (2026-10-20)

- S2: 반대 순서 입력의 Reader A/Z 잠금이 정렬된 동일 A→Z 순서로 수렴하는지, 다른 Reader 범위는 독립 진행되는지 PostgreSQL 15·17 실제 2연결로 검증합니다. 실제 모든 Writer의 다범위 Source 결속 검증으로 간주하지 않습니다.
- S4: 삭제 중간에 늦은 오류를 주입해 보호 자식과 Reader 접근 부모 삭제를 **원자 롤백**하고, Commerce P5Y 보존 및 재시도 성공을 시험합니다. 신규 실행 migration이나 실제 Worker/키 파기·복원 적용은 여전히 HOLD입니다.
