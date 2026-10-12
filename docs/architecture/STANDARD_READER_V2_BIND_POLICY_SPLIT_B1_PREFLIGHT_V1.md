# CAP-B1 — v2 일반 Standard Reader 정책 분기 비공개 Preflight 구현

> 상태: DRAFT / 격리 시험 전용. CAP-B2 실제 Writer 변환 아님. 운영·유료 공개 OFF.
> Watchtower-Track: applizing
> 의존 PR: #1999 (1770 승인 Rule source), 설계 #2003. 별도 DB 잠금·환불 계열 #1983→#1984→#1987→#1993→#1996→#2001.

## 구현된 부분

- `apps/api/src/postgres-standard-reader-v2-bind-policy-preflight-v1.ts`: 동일 transaction-scoped PostgreSQL query client로 Catalog/Unlock → enabled Product/Spec/Domain/effectiveAt → approved Product policy 조회.
- 정확한 `standard_all_readers` 개정만 `standard_candidate`로 분류. `character_capabilities.can_initiate` 행이 없는 정식 Reader도 일반 상품 정책 관점에서 후보를 얻을 수 있으며 Character Capability 행 자체는 변형하지 않는다.
- `premium_character_bound`는 **단일 `targetReaderId`가 일치하는 Reader도 `premium_hold`**. 승인 정책 누락/중복/비활성/출판·Unlock 결핍/위조 Subject/타 Reader/DB 오류는 **withheld**.
- 결과에는 Product/spec/domain, Reader, content bundle, policy revision만 포함한다. Purchase Intent·Receipt·Entitlement Grant·Reading ID·전문 Capability·판매/공개 권한을 만들지 않는다.
- 격리 PostgreSQL에서 공식 Reader `baekheon`의 합성 Bundle에 실제 `character_capabilities` 행이 없는 경우에도, 합성 Standard Rule과 실제 Unlock/Release 조건을 만족하면 *상품 적격성 후보만* 반환하는지 검증한다.

## 명시적으로 미구현

- `cmd_bind_standard_reading_access_v2`는 **여전히 기존 `character_capabilities.can_initiate=true` 검사**를 수행한다. 이번 변경이 실제 Reader 구매 결속을 통과시키지는 않는다. 프리미엄 전용 관계는 다른 Reader의 일반 Standard 적격성에 영향을 주지 않는다.
- Verified production Receipt, current exact Entitlement Grant, 최초 Reading 생성, locked additional Reader mutation, 환불/회수 선행 잠금, idempotent replay authorization, 읽기/쓰기에 걸친 policy revocation 직렬화는 이 Preflight가 보증하지 않는다.
- Policy revision·Release·Grant는 SELECT 사이에 철회될 수 있다. 반환값은 캐시·bearer token·T2 지급 승인으로 사용할 수 없다. DB-owner의 공통 범위 잠금 내에서 다시 읽고 current 유효성을 검증해야 한다.
- `#1999`의 `1770_standard_reader_product_approved_rule_private_v1.sql`과 `#2001`의 `1770_official_reader_provider_revoke_scope_lock_private_v1.sql` 번호 충돌은 각 Owner 합의로 해소해야 한다. 이 PR은 **신규 DB migration이 없다**.
- 새 승인 정책 행/실상품 Offer, Reader public runtime, 결제, 환불 자동 거절, Saju 출처/유료 본문 접근은 활성화하지 않는다.

## 검증 및 이관

- 단위: `test/postgres-standard-reader-v2-bind-policy-preflight-v1.test.ts`의 standard 정상/다중 거절/premium hold/비권한 출력.
- 실 PostgreSQL: 기존 `test/postgres-standard-reader-rule-real-db.test.ts` + `test/db/standard_reader_product_policy_real_postgres.sh`의 disposable DB. 기존 Product source·Catalog·Unlock 및 typechecked TS 실제 조합을 확인.
- 후속 CAP-B2는 **DB·Commerce 소유자가 최초/추가 Reading 및 Provider refund/Grant writer의 공통 lock order + Product approval withdrawal 동시성 + revised policy replay를 승인**한 다음, 1220 역사 수정 없이 새로운 forward-only migration에서 Writer를 구성해야 한다.
- #2003의 BIND-01~29 전체 시험 통과가 아님. 본 변경 성공은 Product rule 선행 정책 분기만 확인한다.
