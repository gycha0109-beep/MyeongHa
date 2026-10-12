# CAP-B2 DB/상품 통합 인수 기록 — v1 / DRAFT

> Watchtower-Track: applizing
> 상태: 통합 후보·비공개, 기존 공개/Checkout OFF. 실제 초기 Reading 및 정책 철회 직렬화 HOLD.
> 기준: DB 잠금·회수 스택 #1983→#1984→#1987→#1993→#1996→#2001→#2004 + Product #1999→#2005→#2007.

## 1. 한 브랜치의 실제 통합 범위

- DB 스택이 가진 **공식 Reader scope 잠금(1740), 현재 Grant 범위 조회(1750), 추가 Reader 영수증/결속 잠금(1760), Provider revoke(1770), 검증된 취소 bridge(1780)**를 유지한다.
- Product의 **일반 `standard_all_readers` / 미래 전용 `premium_character_bound(targetReaderId)`** 룰·DB 승인 원본·Catalog/Unlock·TypeScript Preflight·단위/실PG 검증을 DB 위에 결합한다.
- Product 정책 migration 번호를 `1770`에서 **`1790_standard_reader_product_approved_rule_private_v1.sql`**로 옮겨 **이 통합 브랜치 내 1770 중복을 해소**했다. 이는 원래 #1999 단독 PR이나 기배포 이력에 대한 번호 변경/승인이 아니다. #1999/#2007 스택과 번호 할당을 DB·Product Owner가 일치시켜야 한다.
- 본선의 `1720_standard_reader_product_scope_read_v1.sql`과 RR-03 후보 #1960 `1720_official_reader_assistant_provenance_storage_v1.sql` 충돌은 **다른 책임 트랙**이므로 이 PR에서 임의 수정하지 않았다.

## 2. 실제 SQL Write-path CAP-B2 — 추가 Reader에 한정

신규 migration `1800_standard_reader_additional_policy_locked_private_v1.sql`은 기존 1220 `cmd_bind_standard_reading_access_v2`를 삭제/수정하지 않고, 새 **비공개 별도 Writer** `internal_cmd_bind_standard_reader_additional_policy_locked_v1`를 정의한다.

- 현재 `READ COMMITTED`에서 서버 소유 verified Purchase Intent로부터 **이미 존재하는 공식 Reading×Reader** 범위를 도출하고 공통 S2 advisory lock을 기존 Purchase Intent/Grant/Birth row lock **전**에 취득한다.
- 원본 v2의 정확한 verified Intent/Receipt, 독립적 active purchase Grant, birth revision 및 official Saju Source/Reading, immutable Reader interpretation/access 생성 검사를 계승한다.
- 일반 Standard는 현재 정확히 하나의 **DB 승인 `standard_all_readers`** 룰 및 canonical 9 Reader를 요구한다. 전문 `character_capabilities.can_initiate` 검사만 일반 결속에서 제거하고 전문 행동의 별도 권한은 변경하지 않는다. Premium을 Standard 경로에서 결속시키지 않는다.
- 실결속 직전 현재 Catalog published default Release/Reader availability/Bundle/Unlock을 재조회하며, scope lock 대기 후와 Grant 행 잠금 이후 새 `clock_timestamp()`로 현재 권한을 재평가한다.
- 옛 바인드의 `replayed=true`는 current Grant 증명이 아니므로 새 private Writer는 historical replay를 성공 처리하지 않는다.
- Existing Reading과 Reader scope가 바뀌면 transaction rollback, 초기 Reading을 새로 생성하면 rollback.
- `anon`, `authenticated`, `service_role`, API, Commerce runtime, chat runtime **직접 EXECUTE 없음**. 운영 호출자에 연결하지 않았다.

## 3. 반드시 완료해야 할 DB Owner Gate

| Gate | 현재 상태 | 다음 Owner 작업 |
|---|---|---|
| 추가 Reader 결속 잠금 및 기존 환불 후보 | 코드는 결합·비공개 | issuer/binder/refund/T2 호출자가 모두 이 동일 잠금을 채택했는지 검증 |
| **최초 공식 Reading 생성** | 미지원 / 명시적 DENY | proposed UUID 사용 없이 제품·현재 birth 기반 안정적 식별·잠금 정의 |
| Product 승인 Revision 철회 경합 | 미해결 | 승인 Writer 및 Withdrawal Writer의 공통 잠금/즉시 조회 계약, Product 정책 revision 영구 provenance |
| Historical replay / 재열람 | 신규 Writer는 replay DENY | 재시도 API에서 history-only vs current Grant를 분리 |
| Provider refund ingress | #2004 비공개 bridge만 존재 | 검증된 event normalization, worker identity, Grant effect/T2 경쟁 승인 |
| 캐릭터 Content Release & Unlock revoke race | 조회 증빙은 있음 | 쓰기측과 T2 동일 lock scope 및 version pin |
| PG15/17 전체 BIND-01~29 positive/race | 아직 아님 | canonical official Reader + verified receipt + published release + no specialist positive, 두 독립 DB 연결 경합 추가 |
| 운영 DR | unresolved | migration history recovery/isolated restore, 소유자 승인 |

**위 Gate 없이 SQL 신규 Writer에 EXECUTE를 부여하거나 API/결제에 연결하는 행위 금지.** 비공개 SQL이 존재한다는 사실은 유료 서비스 허가를 뜻하지 않는다.

## 4. 검증 계약

- 기존 DB 권한 전체 CI, Product TypeScript 및 9×9 Standard 정책 테스트, 독립 PostgreSQL 17/Commerce/Content 의존 검사, private Writer ACL·missing Subject 실패, schema catalog SHA.
- `1800` 실제 정상 추가-Reader 신규 mutation은 **격리 실PG positive fixture와 Product Approval/Withdraw 동시성, Refund/T2 interleaving까지 PASS한 후**에만 CAP-B2 완전 구현으로 승격 가능하다.
- DR/Owner approval 없이 merge, Supabase 운영 migration, 결제 공개, Reader 유료 응답·환불 자동 거부 불가.
