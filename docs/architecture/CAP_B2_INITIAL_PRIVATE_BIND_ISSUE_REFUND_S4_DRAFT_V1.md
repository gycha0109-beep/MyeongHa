# CAP-B2/S4 — 최초 공식 Reading 실결속·영수증 발급 PRIVATE 후보

> Watchtower-Track: applizing
> 상태: DRAFT/UNMERGED. 운영 호출자·유료 공개·자동 환불 거부 모두 OFF.
> Base: #2013 S3 최초 잠금/승인 철회 계약.

## 구현

- 1820: 신규 `internal_cmd_bind_standard_reader_initial_policy_locked_v1`. 동일 `READ COMMITTED` 거래에서 DB 유도 Subject×Product×BirthRevision×Saju Scope → Product 정책 잠금을 먼저 취득한 다음, 기존 v2의 구매/검증 Receipt/독립 Grant/Birth/Reading/Source Authority 검사를 실행한다.
- 일반 Standard는 승인 `standard_all_readers` revision과 현재 공식 9 Reader, 활성 Default Release/Catalog/Unlock을 요구하며, 전문 `can_initiate` 부재는 일반 사주 결속 거절 근거가 아니다.
- 첫 Reading만 생성하며 기존 공식 Reading이 발견되면 불일치/중복으로 거절한다. Immutable historical replay는 현재 Grant 발급으로 승격하지 않는다. 최초 Reading이 별도로 발급된 부정확한 다른 Reading UUID는 중복 Source를 만들 수 없다.
- 1830: 새로운 `internal_apply_initial_official_reader_receipt_locked_v1`. verified production Receipt→initial verified Intent→공통 최초 scope/Product 잠금→기존 Commerce `internal_apply_verified_receipt_capability_effects_v1` 호출. Purchase/Grant row 잠금은 최초 스코프 취득 후에만 수행한다.
- 실제 DB 스위트: canonical 세연(전문 Capability 행 0개)의 합성 verified initial Purchase/Receipt/Grant 발급 후 첫 공식 Reading·해설·Access 1건 생성, replay/current rights 부정 검증.
- 새 함수는 전부 **public/anon/authenticated/service/API/Commerce/Chat runtime EXECUTE 없음**. 기존 1220·영구 사주 계산·Commerce 원본 함수 변경 없음.

## 환불·권한 회수의 별도 잠금 계약 필요

기존 #2004 Provider revoke 스택은 **이미 결속된** Reader scope를 먼저 잠그도록 되어 있다. 최초 결속 전 환불이 접근 행 없이 발생할 수 있어 1770은 직접 사용할 수 없다. 또한 #2013의 초기 scope preflight는 현재 enabled Offer/현재 Birth revision을 참조하므로, **상품 은퇴 또는 출생정보 개정 이후**에도 환불이 반드시 작동하도록 하려면 최초 Reading 범위를 구매 당시 불변 provenance로 고정해야 한다.

**따라서 운영 Provider 환불·회수 Writer를 조급하게 호출하거나 원본 Grant를 직접 UPDATE하지 않는다.** DB/Commerce Owner가 구매 시점 scope identity 영구 저장 및 기존 Access 유무에 관계없이 receipt lineage로 잠금하는 경로를 설계/승인해야 한다.

## 남은 출시 차단

- 초기 scope에 대한 immutable authority pin, 취소 이벤트의 동일 잠금·CAS·expiry·T2 경합, 발급과 환불 양방향 2-connection race.
- approval revision을 실제 Access provenance에 영구 귀속, Release retire/Unlock revoke 동시성, 영구 결제 기록·DR.
- BIND-01~29 PG15/17 전체 경합 및 상태 매트릭스, Premium 별도 계약.
- 원 #1999/#2007 상품 migration 1770 재번호 및 RR-03 #1960의 1720 중복 소유자 정리.
- 의존 PR #1983→#2004, #1999→#2007, #2010, #2013은 미병합. 모든 운영 migrate, Checkout, Reader 유료 공개 OFF.

성공한 실DB 결과는 첫 Reading **비공개 candidate 검증**이며, 실제 Product sale/release 허가가 아니다.
