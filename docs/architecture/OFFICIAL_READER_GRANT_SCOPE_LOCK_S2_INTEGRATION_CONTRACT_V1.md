# 공식 Reader 이용 권한 공동 잠금 — S2 소유 트랙 이행 계약 v1

- 기준: `OFFICIAL_READER_PAID_CHAT_INTEGRATION_ROADMAP_20261012_V1.md`, #1827, #1884, 제품 소유자 2026-10-12 결정.
- 구현 상태: **격리된 실제 PostgreSQL 양방향 경합 시험 작성 / 실제 Commerce 운영 Writer 참여는 미구현**.
- 적용 제한: 결제·환불·새 구매권 발급·사주 결속·유료 답변 공개·운영 DB 적용은 전부 기존 차단 유지.
- 기존 `#1983`의 S1 비공개 함수 `internal_acquire_official_reader_scope_lock_v1`를 바꾸지 않고 검증한다.

## 1. 최초 오류와 공동 잠금 목표

기존 `official_reader_new_grant_insert_phantom_preflight.sh`는 이전 구매권 행을 `FOR SHARE`로 잠가도 **독립 영수증으로 새 구매권과 다른 묶음의 Reader 접근이 삽입**될 수 있음을 재현했다. 이전 구매권 행의 잠금은 새 행의 생성을 막지 못한다.

잠금 범위를 구매권 행이나 Bundle로 잡지 않고 **정식 회원 × 공식 Reading × Reader**로 통일하면, 참여하는 모든 Writer가 같은 키를 기다리므로 새 구매권 발급/권한 회수와 최종 조회의 순서를 정의할 수 있다.

그러나 자발적으로 이 함수를 호출하지 않는 Commerce Writer는 기존처럼 잠금을 우회할 수 있다. S2 격리 시험이 통과하더라도 실제 서비스 직렬화가 완료된 것은 아니다.

## 2. 참여 책임·획득 시점

| 실행 경로 | 실제 기존 함수·테이블 | 공동 잠금 이행 계약 | 소유자 |
| --- | --- | --- | --- |
| 검증된 영수증의 구매권 생성 | `internal_apply_verified_receipt_capability_effects_v1`, `entitlement_grants` | 실제 Reader에 영향을 주는 모든 범위를 **변경 전에** 결정하고 같은 DB 거래에서 잠금 → Grant 발급 | Commerce + DB |
| Reader 권한 결속 | `cmd_bind_standard_reading_access_v2`, `standard_reading_reader_access_grants` | 기존 Grant/Birth/Profile 잠금 획득 **이전**에 공동 잠금 획득; 이미 결속된 기록 재생은 현재 권한으로 오인 금지 | DB |
| 환불·철회·권한 만료 반영 | 승인된 결제사 이벤트·Commerce 회수 처리, `entitlement_grants` | 영향을 받는 Reading/Reader 범위를 독립 구매 의도로 역추적; Grant 상태 변경 **이전** 동일 거래에서 잠금 | Commerce + DB |
| 유료 답변 최종 확정 | 향후 RR-03/09 최종 저장 명령 | 공동 잠금 → 현재 모든 구매권/Reading/Product/Release/출처 재검증 → 보호 본문·시도·출처 동시 확정 | DB + Reader |
| 유료 원문 서버 재열람 | 향후 RR-04 유효 답변 및 보호 본문 조회 | 현재 권한·상품·출처 확인. 기존 승인된 실시간 조회 안전 계약 이전에는 공개하지 않음 | DB + Reader |

**원칙:** 영수증 효과 적용과 나중에 별도 거래에서 실행되는 Reader 결속이 분리돼 있다면, 중간에 새 구매권이 관측되는 상태까지 포함해 잠금 계약을 정해야 한다. 단순히 결속 명령에만 잠금을 추가하면 새 Grant 자체를 직렬화한 것이 아니다.

한 구매권이 여러 Reading/Reader 조합을 건드리면 변경 전 전체 범위를 확인하고 **정렬된 동일 순서**로 잠금을 확보한다. 어떤 범위인지 확정되지 않았다면 임의 추정으로 승인하지 않는다. 여러 잠금과 기존 Grant→Birth 잠금 순서는 DB·Commerce 실제 코드 대조 후 확정한다.

## 3. 공통 거래 순서 (승인 전 후보)

1. 서버가 인증된 정식 회원 및 게스트→회원 계보, 공식 Reading 및 실제 Reader 결속 범위를 결정한다.
2. 명시적 DB 거래를 개시한다. 긴 AI 생성이나 외부 결제사 호출을 이 거래에 넣지 않는다.
3. 정렬된 모든 범위에 `internal_acquire_official_reader_scope_lock_v1`를 호출한다.
4. 기존 구매권·Reading·권한 결속 행을 필요에 따라 잠그고 현재 상태를 다시 조회한다. PostgreSQL `READ COMMITTED`의 **잠금 이후 문장별 최신 조회** 또는 동등하게 증명된 거래 격리 방식을 사용한다.
5. 각 소유자의 불변 소스와 멱등성 계약을 검증한 뒤 권한 변경 또는 결과 저장을 수행한다.
6. 원자적 저장 확정 시 잠금 자동 해제. 오류·교착·시간 초과는 전체 취소하고 유료 본문을 공개하지 않는다.

**금지:** T1의 과거 권한 또는 `replayed=true`를 최종 권한으로 취급, 사용자 주장 Reader ID·Bundle로 구매권 발급, 기존 Grade/Capability를 임의 변경, 거래를 유지하며 AI 모델 호출, 조기 스트리밍.

## 4. 이번 S2 검증 (격리 실행)

`test/db/official_reader_scope_lock_s2_instrumented_race.sh`를 **독립 PostgreSQL 데이터베이스**에서 수행한다.

- **최종 판정 먼저:** 구매권 B2 하나가 유효한 상태에서 T2 유사 작업이 공동 잠금을 확보한다. 실제 검증된 합성 영수증 B4의 **신규 구매권 생성+Reader 결속**을 동일 잠금에 참여시킨다. B4는 T2 거래 동안 대기하며 행이 추가되지 않아야 한다. T2 이후에는 B4가 추가되어 **서로 다른 두 묶음이 보이는 상태**가 된다.
- **권한 회수 먼저:** B4 회수 후 B2만 유효한 상태에서 회수 작업이 공동 잠금을 선점한다. T2 유사 작업은 거래 완료를 기다렸다가 현재 조회에서 **유효 구매권 0개**를 확인해야 한다.
- 실패하면 시험 전체 실패; 각 연결과 실제 잠금 대기를 데이터베이스가 기록해야 한다.

이 시험은 `internal_apply_verified_receipt_capability_effects_v1` / `cmd_bind_standard_reading_access_v2` / `internal_qry_character_standard_reading_access_v2`의 실제 SQL을 합성 영수증과 함께 사용하되, **테스트 호출자가 잠금 함수를 선행 호출하는 도구화된 경합**이다. 해당 원본 함수 자체에 실제 적용한 것은 아니다.

## 5. 실제 Writer 채택 전 필수 추가 검증

- 새 영수증·이중 영수증·기존 결속 재실행·회원 전환·다중 Reading/Reader 영향을 소유 데이터에서 복구 가능.
- 정확한 잠금 선행 관계를 Commerce 발급/회수·DB 결속·Reader 최종 저장 전체에서 일관되게 적용. 기존 Grant→Birth 잠금과 교착 없음.
- 만료 경계에서 실제 `clock_timestamp()` 재평가, 잠금 대기 초과 시 안전한 전체 취소.
- 반대 방향 경합·독립 범위 동시성·두 묶음 모호성·한 묶음 복수 유효 구매권·중복 이벤트 멱등성, PostgreSQL 15·17 모두 실제 검증.
- 권한 없는 역할과 잘못된 Subject·RLS·함수 실행 권한 부정 확인.
- 데이터베이스 변경 사항이 신규 개인정보를 보관한다면 삭제/복원 분류 및 승인.
- 운영의 1400~1450 이력과 격리 복원 문제 해결 전 신규 migration 적용 금지.

## 6. 현재 결정과 다음 실행

**완료 구분:** S1 공통 잠금 원시 기능 및 통과한 자동 검사 #1983. S2는 테스트에 참여시킨 합성 구매권·회수 경로에서 직렬화의 동작을 검증하는 단계다.

**미완료 구분:** 실제 Commerce/DB 원본 Writer에 이행한 잠금 절차, 유료 해설의 최종 권한/원자 저장, 보호 본문 격리와 후속 조회.

**다음 작업:** 이 시험의 PostgreSQL 15/17 결과를 확인한 뒤 모든 변경 경로에 대한 잠금 선행 순서표를 코드 수준으로 작성하고 소유자 간 교착 위험을 해결한다. 개별 함수에 먼저 임의 잠금을 붙여 동작 범위를 넓히지 않는다.


## 7. 비공개 현재 묶음 판정 함수 (S2 보조 구현)

- 새 순방향 migration: `1750_official_reader_scope_current_bundle_private_v1.sql`.
- `internal_qry_official_reader_locked_bundle_scope_v1(subject_id,reading_ref,reader_character_id)`는 **동일 거래에서 S1 공동 잠금을 먼저 획득**한 뒤 현재 구매권으로 확인된 Reader 묶음의 수를 다시 조회한다.
- 응답은 `no_active_grant`(0개), `one_current_bundle`(1개 및 묶음 ID), `ambiguous_bundles`(2개 이상, 묶음 선택 없음)으로 제한한다. 동일한 묶음에 여러 구매권이 있어도 묶음은 한 번만 계산한다.
- 장시간 대기 뒤에도 생성 전 과거 시간 대신 **잠금 취득 후 현재 시각**을 사용한다. 거래 격리 수준이 오래된 고정 스냅샷을 유지하면 허용할 수 없으며 호출자 계약에서 이를 검증해야 한다.
- 해당 함수는 `SECURITY INVOKER`, 외부/런타임 역할에 실행 권한을 주지 않는다. 공식 사주 원본·개별 구매권 증빙·Product 규칙·출처 검증·최종 결과 저장을 대신하지 않는다.
- 동일 합성 영수증의 기존 S2 경합 시험에서 현재 묶음 수 **1 → 서로 다른 묶음 2 → 하나 회수 1 → 모두 회수 0**의 경계를 추가 검증한다.
- 부모 #1984의 실제 경합 검증과 이 후보 조회 함수는 **실서비스 권한 판단 함수가 아니며**, Commerce 모든 원본 Writer의 공동 잠금 참여 전에는 최종 유료 공개 근거로 사용할 수 없다.

## 8. 소스 기반 상호 잠금 순서표 및 별개 소유자 경계 (2026-10-20)

| Writer (실제 순방향 정의) | 먼저 취득하는 잠금 | 후속 대상 | 교착 검토 |
| --- | --- | --- | --- |
| `1870 internal_apply_verified_reader_purchase_under_scope_v1` | Purchase XACT advisory → Reader S1 | 1090 Receipt/Grant → 1220 Purchase/Grant/Birth | Purchase advisory 상태에서 Purchase **행**을 보유하지 않고 S1 획득. 다른 1220과 순환 대기 금지 |
| `1900 cmd_apply_verified_portone_reader_full_cancellation_v1` | Purchase XACT advisory → 출처 Receipt의 정렬 S1(이미 결속) | 미결속이면 정확한 Receipt FOR UPDATE → 해당 Grant id 순서 FOR UPDATE; 결속이면 1770 dispatch | **기존 범위를 찾지 못한 분기에서 Receipt/Grant 행을 잠근 후 새 S1을 획득하지 않는다.** 결속 경합 발견 시 전체 롤백·재시도 |
| `1810 cmd_bind_standard_reading_access_v2` | 정확한 Reader S1(제안 ID는 초회만) | Purchase Intent FOR UPDATE → Grant FOR UPDATE → Birth FOR UPDATE | Purchase advisory 미취득; 구매 advisory 보유자가 S1을 기다려도 1220의 Purchase **행** 취득이 가능해야 함 |
| `1770 internal_dispatch_verified_official_reader_revoke_event_v1` | 원본 Receipt의 모든 Reading×Reader S1 정렬 | Grant별 1080 event effect / CAS | 임의 Grant 순서대로 개별 S1 잠금하면 역방향 교착. 해당 함수는 전체 스코프 선점 |
| `1790/1800/1840/1900` legacy writer guards | 호출자 S1 held 여부를 검증(본 함수가 S1 추가 취득하지 않음) | 기존 1080/1090 Grant/Receipt | 직접 호출 우회 시 사전 보유 잠금 없으면 DENY; 새로운 Writer는 전체 범위 정렬 필수 |
| 향후 S5 유료 T2 (미구현) | 정확한 Reader S1 → 재검증 | 본문/시도/원본/출처 원자 저장 | 범위 취득 이후 Purchase/Grant row 잠금 순서와 실제 저장 Writer를 별도 검증해야 함 |

- **DB 실경합 인수:** 구매 advisory만 가진 A가 Reader S1에 대기하는 동안 S1을 가진 B가 **Purchase Intent 행을 잠그고 커밋**해야 합니다. 두 연결 모두 20초 이내 정상 종료, SQLSTATE `40P01`/시간초과·형제 Grant 변경 0. 이 시험은 잠금 원시 순서를 재현하며 모든 원본 Writer 경로의 실서비스 안전성 입증은 아닙니다.
- **잔여 S2 리스크:** 외부 Commerce 이벤트 디스패처/비Reader Grant 혼용, Receipt 이외의 잠금 행, 다중 Reading/Reader scope 재발견, 예약된/후속 T2 Writer, Auth·탈퇴 finalizer와 Grant/Birth 교차 대기는 아직 한 거래 안에서 전역 순서 인수 미완료입니다. 잠금 이후 재조회와 실제 DB 소유자별 교착 계측, 승인 경로 제한이 끝나기 전 S2 전체 완료 판정 금지.

## 9. 다중 Reader 공동 잠금 및 독립 범위 비차단 (2026-10-20)

- S2 원시 DB 2연결 시험에서 **서로 다른 두 Reader 잠금 키(A·Z)**를 같은 Subject×Reading에 대해 사용합니다. 첫 연결이 A를 선점한 동안 두 번째 연결에는 일부러 Z→A 순으로 대상을 전달하지만 정렬된 A→Z 순서로 획득하게 하여 실제 advisory 대기와 두 트랜잭션 정상 커밋을 확인합니다. 잠긴 Reader와 무관한 별도 Reader 키의 `lock_timeout=200ms` 트랜잭션은 기다림 없이 통과해야 합니다.
- 이는 실제 Reader 제품 선택이나 복수 Reading/Reader 생성을 **모사하지 않는 advisory-only 경합**이며 실 영수증·Grant는 변경하지 않습니다. 모든 Legacy Commerce Writer와 다범위 결속/최종 T2의 전역 정렬 인수는 여전히 미완료입니다.

## 10. AccountDeletion Subject/Grant 선잠금과 실제 PortOne 환불 Writer 경합 (2026-10-20)

- 실제 1520 계정 삭제는 Subject → 삭제 Job → Outbox를 잠그고 Reader 접근 자식 행을 삭제합니다. 운영 계정 삭제 요청이 없는 B8 합성 회원에 전체 1520을 호출하면 위험한 가짜 완료가 되므로, **독립 DB 연결이 Subject FOR UPDATE → 출처 Grant FOR UPDATE를 점유**하는 최악의 경합만 구성합니다.
- 다른 DB 연결은 실제 `cmd_apply_verified_portone_reader_full_cancellation_v1`로 이미 결속된 B 영수증의 **검증된 환불을 실행**합니다. 첫 연결이 잠금을 놓을 때까지 PostgreSQL Lock 대기, 이후 B Receipt/Grant만 정확히 revoked·Provider Event 1개, C 형제 Receipt의 active Grant 유지·교착 없음이 필수입니다.
- 이 실경합은 실제 1520 Job/Outbox lease, Auth 삭제와 Commerce webhook의 완전한 양방향 순서 인수가 **아닙니다**. 운영 Worker/결제 이벤트 통로에 추가 코드를 넣지 않고 기존 S2 미완료를 유지합니다.


## 12. 동일 PortOne 검증 이벤트 동시 재처리 (2026-10-20)

- 기존 B 환불/계정 삭제형 행 잠금 경합 이후, 독립 C Receipt를 대상으로 두 개의 **실제 DB 취소 Writer 거래**가 동일 cancellation ID·원본 거래·시각·증명 fingerprint를 가지고 동시에 처리합니다. 선행 거래가 커밋 전 4초간 구매 advisory를 보유하는 동안 재처리 거래가 잠금 대기한 뒤 커밋해야 합니다.
- 정확한 C Receipt/Grant revoked, 동일 Provider Event 1건·연계 Entitlement revoke Event 1건, 이미 회수된 B Grant 복구 0건을 확인합니다. 포트원 API/실거래는 호출하지 않으며, 서로 다른 이벤트의 역순 도착·모든 Writer 범위 인수는 계속 미완료입니다.


## 13. 서로 다른 PortOne 취소 이벤트의 역순 도착·증빙 충돌 (2026-10-20)

- 동일 C 영수증의 취소가 최신 이벤트로 이미 `revoked` 된 이후, **새 취소 ID를 가졌지만 더 오래된 제공자 시각**의 검증 이벤트를 별도 DB 연결에서 호출합니다. 독립 구매 advisory holder가 먼저 잠금을 점유하므로 실제 Lock 대기 후 출처 Grant `last_effective_at`과 대조해야 하며, 오래된 이벤트는 명시적 stale 오류·Provider Event 추가 0건·C Grant 수정 0건으로 종료해야 합니다.
- 같은 기존 취소 ID를 **다른 증빙 fingerprint**로 재생하면 출처 검증 충돌이 발생해야 합니다. 이미 확정된 Provider Event와 연결된 Entitlement revoked Event는 각각 정확히 한 번만 유지되며, B 형제 Grant 역시 revoked 상태를 보존합니다.
- 이번 시험은 검증된 DB 취소 Writer만 호출하며 실제 PortOne API, 운영 사용자, 모든 Commerce event 종류의 순서 정책을 새로 정의하지 않습니다.


## 14. 같은 취소 ID의 다른 원본 영수증 유입 차단 (2026-10-20)

- 이미 독립 C 영수증의 Verified 취소로 확정된 `b8-cancel-concurrent-c`를 **동일 구매의 B 영수증**에 재사용하는 합성 PortOne DB 취소를 실행합니다. 기존 정본 `cmd_apply_verified_portone_reader_full_cancellation_v1`가 Provider Event의 `resolved_receipt_id`를 C로 고정하고 `official_reader_portone_cancel_replay_conflict`를 반환해야 합니다.
- 차단 이후에도 Provider Event의 원본 C 1건·출처 C Grant의 `revoked` Entitlement Event 1건이 유지되고, B Grant에 해당 Provider Event의 효과 0건을 검사합니다. 서로 다른 결제·영수증을 하나의 취소 이벤트로 합치지 못하도록 하는 검증이며 외부 실제 결제·환불 처리는 없습니다.


## 15. 다른 원본 B/C의 실제 동시 회수 재처리 (2026-10-20)

- 같은 Purchase의 **결속된 B Receipt**와 **미결속 C Receipt**에 대해 각각 이미 검증·확정된 서로 다른 PortOne 취소 ID를, 실제 `cmd_apply_verified_portone_reader_full_cancellation_v1`의 **독립 DB 연결 2개**에서 동시에 재생합니다. B 거래가 purchase advisory lock을 획득한 상태에서 커밋 전 지연되고, C 거래가 동일 구매 잠금에서 기다린 뒤 정상 종료해야 합니다.
- 재생 완료 후 B/C Provider Event의 `resolved_receipt_id`가 서로 뒤바뀌지 않고 각 1건, 정확한 출처 Grant의 `entitlement_events`만 각 1건, 잘못된 형제 Grant와의 교차 효과 0건, 이미 회수된 B/C 권리 재활성화 0건을 검사합니다.
- 이는 **기존 검증된 서로 다른 취소 이벤트의 동시 멱등 재처리**이며 서로 다른 새 유료 결제나 외부 PortOne API를 실행하지 않습니다. 외부 비Reader Writer·상대 서비스의 순서 및 운영 상태 기동은 S2 전체 종료 검증에 남아 있습니다.


## 16. verified 영수증 발급 선행 → 취소 후행 실제 Writer 경합 (2026-10-20)

- 기존 B8과 **동일 Subject·Reader S1 범위이지만 별도 신규 E Purchase**를 `created`로 발행해 실제 결제 시도를 먼저 기록하고, `verified` 전환 이후 **신규 E Receipt**를 합성하고, 첫 DB 연결이 `Purchase advisory → Reader S1` 공동 잠금하에 실제 `internal_apply_verified_receipt_capability_effects_v1`로 Grant를 발급한 뒤 COMMIT 전 대기합니다. 둘째 DB 연결에서 정본 `cmd_apply_verified_portone_reader_full_cancellation_v1` 취소가 구매 잠금에 대기했다가 첫 COMMIT 이후 E만 revoked 처리하는 **발급 선행 방향의 실경합**입니다.
- E Receipt revoked, 정확한 E Grant revoked·Reader 결속 0, E Provider Event 및 출처 Grant revoked Event 각각 1건, 기존 B/C 회수 상태 불변을 검사합니다. 앞선 B5 **취소 선행 → 발급 불가** 시험과 순서가 반대입니다.
- 이 시험은 이미 존재하는 공식 Reading에 대해 **기존 Receipt→Grant Writer**를 공동 잠금으로 감싼 것입니다. 별도 공식 Reading 생성·Access 결속까지 수행하는 전체 `internal_apply_verified_reader_purchase_under_scope_v1` 경로의 운영 인수를 대신하지 않으며, 모든 외부 Commerce 발급 동시성 종료 판정도 아닙니다.


## 17. 발급·결속·환불 3중 Writer 실경합과 bound 재시도 (2026-10-20)

- 독립 신규 F verified Purchase/Receipt를 **정본 순서(created → Attempt → verified → Receipt)**로 생성합니다. 첫 DB 연결에서 `internal_apply_verified_reader_purchase_under_scope_v1`이 `Purchase advisory → S1 → Grant 발급 → 실제 Reader Access 결속`을 한 트랜잭션으로 처리하고 COMMIT 전 잠금을 유지합니다.
- 두 번째 연결은 **실제 `cmd_bind_standard_reading_access_v2`**로 같은 F 결속의 멱등 재시도를 시도하며 S1 advisory에 대기합니다. 세 번째 연결은 **실제 검증된 PortOne F 취소 Writer**로 F Purchase advisory에 대기합니다. 최초 취소 경로는 결속 전 상태를 관측했으므로 선행 결속 커밋 뒤 잠금 재확인에서 `Reader binding completed during cancellation lock wait; retry under its bound scope`로 **전체 롤백**되어야 하며, 원본 Receipt와 Provider Event는 건드리지 않아야 합니다.
- 이후 새 거래에서 같은 취소 증빙으로 bound S1 회수 경로를 재시도해 F Receipt/Grant revoked, F Access 출처 보존, Provider Event 및 Grant revoked Event 각각 1회, 다른 B/C/E 출처 불변을 증명합니다. **세 연결 모두 실제 데이터베이스 함수**를 호출하지만 합성 결제·인증 정보로만 시험합니다. 운영 모든 Commerce Writer 인수, T2/S5 유료 노출은 여전히 HOLD입니다.
