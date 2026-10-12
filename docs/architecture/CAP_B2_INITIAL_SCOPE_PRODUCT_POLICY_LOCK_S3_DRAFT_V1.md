# CAP-B2 / S3 — 최초 공식 Reading 안정 잠금·Product 정책 철회 직렬화

> Watchtower-Track: applizing
> 상태: **DRAFT / PRIVATE / UNMERGED**. 최초 Reading 생성 Writer/Provider ingress/API/T2는 OFF.
> 의존: DB Scope S1/S2 (#1983~#2004), 상품 Source 1790, 추가 Reader 비공개 Binder 1800, 통합 후보 #2010.

## 1. 최초 공식 Reading 잠금 정체성

새 1810 forward-only migration:
- `internal_qry_official_reader_initial_scope_candidate_v1(subject,purchaseIntent)`: **정확한 verified Purchase Intent와 서버 소유 initial offer role**, 고정된 Product/Spec/Domain, 현재 자기 Birth Revision 및 Saju runtime을 조회해 단일 후보 scope를 도출합니다. 선택된 Reader 존재 여부는 검사하지만, Reader 자체는 공식 Reading 잠금 ID에 포함하지 않습니다.
- `internal_acquire_official_reader_initial_purchase_lock_v1(subject,purchaseIntent)`: **READ COMMITTED** 강제, 잠금 전/후 동일한 DB 기반 정체성을 재조회해 드리프트 시 예외. Advisory transaction lock만 획득합니다.
- 키 필드: canonical Subject, Product ID, **current self Birth Revision ID**, topicKey, sajuDomain, readingPeriod, readingVariant, productSpecVersion, domainCapabilityVersion. `proposedReadingId`, 클라이언트 UUID, Reader Character ID, 개별 Receipt/Grant ID는 없음.
- SQL은 **기존 `cmd_bind_standard_reading_access_v2` 1220을 변경하지 않고** 신규 PRIVATE 함수로만 존재합니다. 검증된 Receipt, current Entitlement Grant, Source generation 및 새 Reading/Access insertion은 아직 이 함수의 책임이 아닙니다.
- DB Owner가 최초 거래부터 Reader 구매권 발급/환불/Reader 결과 공개까지 어느 Writer가 언제 **initial scope → Product policy → Reader scope** 잠금을 순서대로 보유할지 추가 계약해야 합니다. 이 단계에서 임의 자동 결속은 위험합니다.

## 2. Product 승인·철회 레이스

- `internal_acquire_standard_reader_product_policy_lock_v1(productId)`: Product ID 단위로 모든 spec/domain/revision을 가로지르는 단일 transaction advisory lock. 다른 Product와는 독립.
- 원본 승인 규칙 `standard_reader_product_approved_rules_v1`과 철회 `standard_reader_product_rule_withdrawals_v1`에 **BEFORE INSERT 트리거**를 설치합니다. 별도 관리자 SQL도 Product lock 없이 규칙을 삽입할 수 없으며, UPDATE/DELETE는 기존 append-only 트리거가 막습니다.
- 기존 1800 비공개 **추가 Reader Binder**도 Purchase/Grant/Birth row lock보다 먼저 **Reader scope lock → Product policy lock** 순서로 취득하며, 잠금 이후 승인 규칙을 조회합니다. 반환 직전 승인된 **동일 Revision의 유효성**을 DB 현재 시각으로 재확인합니다.
- 새로운 Premium `premium_character_bound(targetReaderId)`가 일반 `standard_all_readers` 결속으로 우회되지 않으며, 별도 프리미엄 상품/전문 Capability와 유료 접근은 계속 HOLD.
- **제약:** 기존 승인 정책 생성/철회 외 별도 Product Enabled/Spec Retire/Release/Unlock 변경 Writer가 이 Product/Reader 잠금을 공유한다는 보장은 아직 없습니다. 유효시각 경계 및 잠금 직전/직후 snapshot 테스트를 확대해야 합니다.

## 3. 실제 경합 테스트

`test/db/standard_reader_initial_policy_scope_lock_race.sh`:
1. 격리 PG15에서 실제 v2 initial Purchase/Birth/Receipt fixture를 구축하되 **첫 공식 Reading 생성 직전에서 중단**합니다.
2. 같은 Subject/Product/Birth·Spec이지만 서로 다른 Reader와 Purchase Intent를 가진 두 initial 구매 후보가 **동일 scope identity**를 반환하며, 공식 Reading이 아직 없음을 확인합니다.
3. 독립 PostgreSQL connection A가 initial lock 취득 후 B의 재시도는 `lock_timeout`으로 막히고, A commit 이후 B가 통과하는지 확인합니다.
4. Product policy lock holder가 있을 때 **승인 새 Revision 직접 INSERT**와 **철회 INSERT** 모두 막히는지, 해제 후 완료되는지 확인합니다.
5. 철회 후 읽기 전용 승인 정책 쿼리는 0행을 반환하고 일반 해설 권한이 부여되지 않음을 확인합니다.
6. Public·authenticated·service/API 역할에는 초기 잠금 및 Product 잠금 직접 EXECUTE가 없음을 확인합니다.

## 4. 미완료·중단 기준

| 대상 | 완료 판정 |
|---|---|
| 추가 Reader 신규 Standard 결속 | #2010 실PG15 positive PASS, 이후 1810 정책 잠금/Revision 재검증 추가 |
| **최초 공식 Reading 실결속** | 잠금 계약/경합 preflight만. **실제 Writer 미구현** |
| 전체 issuer/Provider refund/Grant revoke/T2 | 공통 scope lock 전 경로 도달성 Owner 승인·실제 race 미완료 |
| 승인·철회 경합 | 1810 테이블 트리거·B2 Reader Writer·두 연결 테스트를 검증해야 함 |
| Product/DB migration | #2010 통합 브랜치 1770/1790 분리. 원 #1999/#2007·DB #2001 스택 재정렬 및 #1960의 1720 충돌 미완 |
| Production DR 및 paid reveal | DR 증빙·Commerce/Product/DB/Reader/Legal 최종 승인 전 OFF |

**초기 scope key가 확정되었다는 것과 첫 유료 Reader 결속이 허용되었다는 것은 별개의 판정입니다.** 최초 구매 Intent의 verified 상태는 검증된 provider Receipt 및 독립 Grant의 대체물이 아닙니다.
