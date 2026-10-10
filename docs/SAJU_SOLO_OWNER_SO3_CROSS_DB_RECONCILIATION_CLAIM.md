# SO-3 선행 계약 — 분리된 DB 소비 결과의 읽기 전용 합성 대조

Watchtower-Track: saju-bridge

> **코드/합성 계약만 존재합니다.** 운영 Credential, Root, KMS, 보안 계정, Production/격리 Staging DB, 네트워크, 유료 자원, Runner, Commerce를 생성하거나 연결하지 않습니다.

## 목적

Challenge 원장과 Admission 원장이 서로 다른 DB에 존재할 때, 하나의 원장만 성공하거나 COMMIT 응답이 불명확한 경우 이를 전역 트랜잭션 성공으로 오인하지 않는 읽기 전용 사전 계약입니다. 이전 SO-2 signed Registry/Floor를 수정하거나 연결하지 않습니다.

`apps/api/src/saju-held-staging-solo-owner-reconciliation-v1.ts`의 `assessSajuSoloOwnerCrossDbReconciliationV1`은 `readTrustedTimeMs`, `readChallengeState`, `readAdmissionState` 세 개의 **주입된 읽기 전용 Port**를 호출합니다. Port 구현의 인증·IAM·별도 보안 계정·증빙 서명과 신뢰 시각은 타입만으로 입증되지 않으며 현재 어떤 실제 서비스에도 연결되어 있지 않습니다.

## 불변 조건

- 기대 환경, Permit UUID, Manifest/Connection Plan digest, MyeongHa/Saju 두 SHA, request digest의 정확한 범위를 고정합니다.
- 각 원장 관측 주장에는 source domain, 출처 참조, 관측 시각을 요구합니다. 서로 다른 문자열 참조만으로 독립성을 증명하지 않습니다.
- 관측 불능·오염·오래된 시각·불일치·예외는 `RECOVERY_HOLD`, 기대 범위 자체가 불량이면 `BLOCKED`입니다.
- `ISSUED/ISSUED`는 변경 미발송 주장일 때만 `CONSUMPTION_PENDING`입니다. 변경 발송 이력 주장이 있으면 `CONSUMPTION_UNKNOWN`입니다.
- 한쪽만 `CONSUMED`면 `CROSS_DB_PARTIAL_HOLD`, 알려지지 않은 상태는 `CONSUMPTION_UNKNOWN`, 철회/만료는 `REVOKED`/`EXPIRED`입니다.
- 양쪽 `CONSUMED`도 `CONSUMED_RECONCILED`라는 **합성 주장**일 뿐 실제 독립 검증·원자성 또는 Runner Admission을 뜻하지 않습니다.
- 결과는 항상 `observationAuthority/trustedClockAuthority/auditDurability/crossDbAtomicity=NOT_VERIFIED`, `stagingAdmission=HOLD`, `mayRetryConsumption=false`, `canRunOnce/canExecute/canPublish/canSell=false`를 유지합니다.

## 실환경 연결 전 필수 조건

읽기 전용 서비스의 인증된 workload identity와 허용된 네트워크 위치, Root/Registry custody, 쓰기 불가능한 감사 분리, 외부 high-water, 신뢰된 시간, 원장 DB의 실제 독립성과 atomic query, 운영 R01~R14 관측 및 승인된 복구 절차를 개별 증빙해야 합니다. `unknown COMMIT`의 감사·복구는 담당 Owner의 별도 강인증·독립 감사 후 수동 결론이 필요하며 자동 재시도가 금지됩니다.

테스트: `test/saju-held-staging-solo-owner-reconciliation-v1.test.ts`. 기존 scoped CI 재사용, 신규 Workflow/운영 Migration 없음.
