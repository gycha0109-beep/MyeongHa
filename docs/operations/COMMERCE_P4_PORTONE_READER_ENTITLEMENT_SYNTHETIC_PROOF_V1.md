# Commerce P4 — PortOne V2 개별 취소 → 정확한 Reader Entitlement Effect 합성 검증

**작성일:** 2026-10-31
**상태:** 로컬/CI 전용 PostgreSQL 합성 시나리오. 운영 경로·공개 엔드포인트·금전 환불·자동 권한 회수 비활성 유지.

## 구현 목적 및 실제 변경

- `test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sql`은 기존 공식 Reading/Reader A/B 구매 fixture에 합성 PortOne V2 `Transaction.Cancelled` 및 `commerce-portone-cancellation-source-v2` 개별 SUCCEEDED 취소 데이터를 구성합니다. 임의 계정/금액이나 원본 거래 ID를 섞어 적용하지 않습니다.
- 합성 결제 A/B 중 정확한 B2 취소 이벤트와 B2 Receipt/Subject/Purchase Intent/Grant를 **Provider Event FOR UPDATE → Grant FOR UPDATE** 순서로 잠급니다. 별도 B3 구매 Grant는 고유 원본 Receipt를 유지합니다.
- 기존 `public.internal_apply_entitlement_effect_v1`을 합성 DB에서 실제 호출하여 B2 **Grant revoked + Entitlement Event 기록**을 확인하고, 같은 이벤트/동일 의미로 재실행하면 멱등 처리되며 B3 Grant는 계속 활성 상태인지 검사합니다. 같은 이벤트로 B3를 변경하려는 시도는 기존 Receipt-Grant 계보 검증에서 차단됩니다.
- 합성 검증의 B2/B3 활성화·취소 이벤트 추가·권한 변경은 **마지막에 ROLLBACK**됩니다. 검사 실행기 `test/db/commerce_portone_v2_exact_reader_effect_synthetic_v1.sh`는 임의 운영 DB를 대상으로 실행되지 않도록 고립 `myeongha_*` DB를 요구하며, `test/db/run_authority_core.sh`의 격리 DB 생성 단계에 포함합니다.
- `test/commerce-portone-v2-exact-reader-effect-synthetic-v1.test.mjs`은 실행 범위·원본 결제 계보·구체적 취소 금액·CAS·멱등·다른 Reader 보호를 고정합니다.

## 무엇을 증명하지 않는가

- 이 검증은 **실제 PortOne 웹훅 서명, GET, 환불 최종 완료, 제공 시점 및 법적 청약철회 판정, Provider NEWER/STALE 순서**를 검증하지 않습니다. 합성 이벤트는 실제 인증된 Provider 데이터가 아닙니다.
- Generic Entitlement Effect writer가 원자적으로 회수 가능하다는 것만 증명합니다. writer 자체는 Provider 이벤트 순서·법적 환불·Reader R2/T2 최종 공개를 판단하지 않으므로 **운영 실행 경로는 만들지 않았습니다.**
- 기존 `commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs`의 `grantRevocationAuthorized=false`와 `readerT2LockHeld=false`를 바꾸지 않았습니다.
- **실제 PostgreSQL 17** 전체 스키마 검증은 CI에 연결했으나 해당 실행 결과가 나오기 전까지 PASS로 보고하지 않습니다.
- 할인·부분 취소·사용한 디지털 콘텐츠 또는 분리된 Reader 별 청약철회는 실제 증거와 법적 결론이 있어야 하며 단순 Cancelled 태그만으로 자동 회수하지 않습니다.

## 후속 작업

Provider 최신 취소 상태 비교 및 확정된 법적 처리·제공 증거, Reader R2/T2 전역 잠금 조건을 기존 내부 검증기와 결속한 뒤에만 운영 권한 변경 실행을 활성화할 수 있습니다. P0-PR-01과 확정된 정책을 다시 승인받을 필요는 없습니다.
