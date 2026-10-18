# C08-Z — 실제 PG17 공유 예약의 신뢰된 선입장 행 검증 (폐기형 CI 전용)

Watchtower-Track: character-memory

## 해결한 문제

C08-Y의 공유 DB 원장은 두 독립 PostgreSQL 세션의 같은 예약 경쟁을 직렬화했으나, 최초 입장 claim_batch_v1은 **요청자가 임의로 제공한 양의 run ID 및 형식에 맞는 SHA만으로 첫 배치를 선점할 수 있었습니다**. 예산 통제 원장으로 실제 사용할 때의 선입장 신뢰 경계가 빠진 것입니다.

C08-Z는 기존 C08-Y disposable PG17 스키마에 **별도 관리자만 쓸 수 있는 trusted_admissions 행**을 추가했습니다. 여기는 정확한 고정 배치명, 실행 ID, HEAD SHA, OFFLINE_ONLY 스코프, paid_dispatch_enabled=false가 함께 존재해야 하고, 예약자는 어떤 직접 테이블 SELECT/INSERT/UPDATE/DELETE 권한도 갖지 않습니다.

- 관리자 승인 행이 없을 때의 모든 최초 claim은 false이며 데이터베이스에 batch_claims 행이 생성되지 않습니다.
- 승인 행이 생긴 이후에도 거기에 기록된 run ID와 HEAD SHA가 **동시에** 일치해야 두 백엔드 선입장 경합에 참여할 수 있습니다. 여전히 UNIQUE 제약으로 한 쪽만 성공합니다.
- claim뿐 아니라 모든 reserve_slot_v1, observe_slot_v1도 고정 admission 행과 실제 batch_claims의 ID/SHA 일치를 다시 검사합니다. 관리자 측 admission을 제거하면 후속 예약 및 관측이 false입니다.
- 기존 첫 배치 6 Gold 슬롯, 슬롯별 3,277 microUSD, 총 19,662 microUSD와 5,000원 승인 범위는 바꾸지 않습니다. 모델/provider/실사용자 데이터는 없습니다.
- CI에서 실제 PG17 두 세션 선점 경쟁, 미승인·다른 ID·다른 SHA·중복·미관측·UNKNOWN 결과·관리자 승인 철회를 확인합니다.

## 여기서 끝나지 않은 신뢰 경계

**이 관리자 승인 행 자체는 GitHub OIDC/Actions 실행 ID가 인증됐다는 증거가 아닙니다.** 테스트 관리자 postgres가 합성 승인 행을 직접 만듭니다. 실제 배포에서는 GitHub run 및 HEAD와 연결된 인증된 OIDC subject, 독립된 자격증명/저장소 Owner, 최소권한 Runner 전용 인증, 조작할 수 없는 감사 원장, 재해복구 시 중복 지출 차단을 따로 구현·검증해야 합니다. 승인된 run ID와 SHA를 알고 같은 제한 역할을 얻은 다른 프로세스의 선점도 이번 단계는 방어한다고 주장하지 않습니다.

해당 스키마는 테스트 경로 test/db/ 아래에만 있으며 **Supabase migrations, 운영 DB, 공개 서비스 라우팅, GitHub Secret 또는 GitHub Actions 유료 Workflow에는 적용하지 않습니다**. Model POST 신규 호출 0건, C07 실측 6/72, 66 미관측, providerHardLimitVerified=false, invoiceReconciled=false, actualBilledKrw=null, globalCrossRunReservationVerified=false, paidDispatchEnabled=false 및 Production/G0–G6 HOLD 모두 유지합니다.

## 검증

- npx vitest run test/seyeon-cost-c08z-preadmitted-pg17-ledger-contract-v1.test.mjs test/seyeon-cost-c08y-pg17-shared-ledger-contract-v1.test.mjs
- disposable GitHub Actions DB_SUITE=postgres17에서 seyeon-c08y-disposable-shared-ledger-pg17
- 정확 HEAD CI/Governance + PG17 Full Integration + 병합 후 main CI.

이 조건이 성공해도 실제 유료 호출 승인은 별도의 공급자 청구 증빙, 월 USD1 hard cap, 프로젝트/키 귀속, 기존 11회 정산, 글로벌 원장 및 독립 보안검토가 필요합니다.
