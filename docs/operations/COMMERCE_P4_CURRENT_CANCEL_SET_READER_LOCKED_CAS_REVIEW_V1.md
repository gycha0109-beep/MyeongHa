# Commerce P4 — 인증 취소 전체 집합과 정확한 Reader 구매권 잠금·버전 검사 연결

작성일: 2026-11-01
상태: 운영 내부 검증 후보. 실제 금전 환불·Reader 권한 회수·LIVE 결제 비활성.

## 기존 구현 연결

- PR #2837에서 완료된 `reconcileStoredPortOneCancellationSetWithGetPrivateV1`의 **저장된 영수증별 모든 취소 항목 ↔ 인증된 PortOne GET 전체 항목** 대조를 먼저 실행합니다. 두 개의 독립적인 완전 가시성·읽기 전용 DB 스냅샷은 각각 ROLLBACK합니다.
- 이번에는 정확한 `providerEventId`가 **첫 번째와 두 번째 저장 취소 집합 모두에 각각 단 한 건** 있는지 확인하도록 확장합니다. 지정한 이벤트가 아예 없거나 중간에 다른 이벤트로 대체되면 외부 GET/잠금 단계를 진행하지 않거나 HOLD 처리합니다. 사용자·Reader·취소 원본 ID는 로그와 결과에 노출하지 않습니다.
- 이 검증이 성공한 경우에만 기존 `inspectLockedReaderRevokeCasPreflightV1`로 이어갑니다. 같은 `providerEventId`를 `FOR UPDATE`로 잠그고 원본 Receipt·Subject·Purchase Intent를 가져온 뒤, **기대하는 정확한 영수증 ID**와 일치해야만 해당 Reader Grant를 잠급니다.
- 잠긴 Grant의 revision과 마지막 Provider ordering key를 전달된 기대값과 비교하고, 같은 Event 효과가 이미 적용됐는지 기존 SQL로 확인합니다. SERIALIZABLE 잠금 트랜잭션도 무조건 ROLLBACK합니다.
- 기존 API, 소비자 취소 요청, 운영 migration, Provider POST, `internal_apply_entitlement_effect_v1` 호출을 추가하지 않습니다.

## 처리 결과와 안전 경계

- `exact_reader_locked_cas_consistent_but_authority_held`: GET 전체 집합과 원장이 일치하고, 정확한 이벤트/영수증/Grant 잠금·CAS가 일치했다는 **검증 관측**입니다. 새로운 Grant 회수는 **절대 허용하지 않습니다**.
- `existing_exact_event_revoke_replay_observed`: 과거 동일 이벤트의 실제 `entitlement_events`와 이미 회수된 Grant가 함께 확인됐다는 **중복 재실행 관측**입니다. 과거 효과를 다시 기록하지 않습니다. 여기서만 `SAME`으로 표시합니다.
- `current_cancel_set_or_exact_event_not_ready` / `exact_reader_locked_cas_or_source_changed`: 취소 이벤트 누락·변경·Grant 재할당·버전 충돌·추가 DB 오류 등 모두 실패하거나 보류합니다.
- 인증된 전체 GET, 두 스냅샷과 SERIALIZABLE CAS 일치로도 **현재 Provider의 공식 NEWER/STALE 순서, 법적 환불 결론, 실제 유료 Reader 제공·전달, R2/T2 공유 범위 원자적 잠금은 증명되지 않습니다.** `providerOrderingProven=false`, `currentProviderFinalityProven=false`, `legalRefundAuthority=false`, `readerT2LockHeld=false`, `grantRevocationAuthorized=false`, `refundExecutionAuthorized=false`, `writesPerformed=false`로 고정합니다.
- 외부 GET과 잠금 사이에서 상태 변화가 발생할 수 있으므로 **읽기 전용 사전 증거는 실제 권한 효과와 원자적으로 연동된 것이 아닙니다**. 실제 운영 Effect writer와 선행 조건/잠금 순서를 허가하거나 구현했다고 주장하지 않습니다.

## 검증 범위와 다음 단계

- `test/commerce-current-cancel-set-reader-locked-cas-review-v1.test.mjs`: 실제 내부 모듈 조합과 인증 GET 합성 응답, Event→정확한 Grant 잠금 순서, 고객/영수증 혼입 거부, CAS revision 변경, 부분 취소, provider ordering 문자열, 중복 회수, 환불·권한 효과 미호출.
- `test/commerce-portone-cancellation-set-provider-get-reconciliation-v1.test.mjs`: 전체 집합에 정확한 Event 포함 여부와 두 DB 스냅샷 간 변경, 외부 GET 전 거부 검증.
- `test/commerce-exact-reader-revoke-cas-locked-preflight-v1.test.mjs`: 잠긴 Event의 Receipt ID와 기대 Receipt ID가 다르면 **다른 Reader Grant 잠금 전에 거부**.
- SQL과 스키마는 기존 검증된 `commerce_provider_events`, Receipt 및 `standard_reading_reader_access_grants`를 그대로 사용합니다. 이번 PR에는 DB migration 변화가 없습니다.
- 다음 안전 관문은 승인된 Provider NEWER/STALE 판단 혹은 동등 최신 상태 조정, 합법적인 독서·청약철회 판단 근거, Reader 최종 R2/T2 잠금과 기존 실제 Effect writer의 동일 트랜잭션 결속입니다.

참고: PortOne V2 결제취소 가이드 https://developers.portone.io/opi/ko/integration/cancel/v2/readme
