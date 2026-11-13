# Saju 내부 상용 해석 정책 — MyeongHa 구매·발급·Reader 인계 (2026-11-13)

> 현재 상품·연동 판단의 정책 갱신. 대상: [Saju #2762](https://github.com/gycha0109-beep/Saju/pull/2762), [Saju #2763](https://github.com/gycha0109-beep/Saju/pull/2763), [MyeongHa #3174](https://github.com/gycha0109-beep/MyeongHa/pull/3174). 이전 pinned 실행 증거·과거 설계 결정은 이력으로 보존하며, 본 문서는 실제 출시 또는 금전 거래를 승인하지 않는다.

## 확정 결정

1. 명하의 해석은 **제품 소유자가 채택한 내부 계산·서비스 해석 규칙**을 기준으로 검증한다. 추가 논문, 명리 전문가/기관 승인, 전체 학파 통합을 **출시 선행 조건으로 요구하지 않는다**. 과거 서지·원문 증거는 삭제하지 않는다.
2. 실제 입력·원국/대운/서울 기간·상대 2명식·해석 규칙 버전과 Korean Reading의 **정확한 대응**은 필수다. 지원하지 않는 용신 강약·관계 결과 예언을 생성하지 않는다. 외부 문헌 미비가 다른 검증된 내부 풀이를 일괄 보류할 이유는 아니다.
3. 이미 작성된 구매·발급 경계는 그대로 유지한다: 승인된 Offer/가격, Birth revision, Record, 결제 Origin, 대행사 확정 영수증, 서명/해시 검증, nonce 및 재시도·중복 방지, 상대의 처리 동의·철회, 환불/취소 후 Grant 차단, Reader 재열람, 민감정보 최소화·운영 복구.
4. `source`, `grounding`, `authority`, `proof`, `signature` 기술적 출처·무결성 장치의 이름만 보고 비활성화하지 않는다.

## 실제 현재 인계 격차

| 경로 | 계산·의미 측면 | 발급·구매 측면 | 현재 결론 |
| --- | --- | --- | --- |
| 연운 | Saju #2762에 서울 선택년/입춘 구간·원국·대운 및 기존 T9 후보 의미와 Reader 기간 사실 계산이 있다. 내부 검증된 규칙만 정식 소비자 문장으로 확정해야 한다. | 승인된 구매 연도·Birth revision·요청 해시와 Saju 정식 발급 Release의 정확한 연결 및 연도별 Reader 재열람 확인 필요 | **내부 해석 준비는 별도 확인, 판매 HOLD** |
| 월운 | Saju #2762에 절입 전후 계산과 월주·원국 맥락이 있다. 각 구간의 실제 핵심 의미와 모순·시각 미상 검증이 필요하다. | 요청한 서울 달력월·두 절입 구간, signed source 및 Reader의 기간 완전성 확인 필요 | **내부 해석 준비는 별도 확인, 판매 HOLD** |
| 관계 첫 비교 | Saju #2763은 두 원본 명식·합충 계산·조건부 한국어 내부 해석 시안을 갖는다. 별도 Official 소비자 Reading 계약으로 입증되기 전 연구용 내부 시험 경로다. | 상대 처리 동의·원본 명식 두 건·Origin·서명·중복 발급·Reader | **실제 해석/발급 연결 미완료, 판매 HOLD** |
| 관계 추가 비교 | 동일 본인과 서로 다른 상대 명식·각각의 독립 구매/동의/발급을 구별해야 한다. | 상대별 Grant·이미 지급된 첫 비교 이후 상품 구성·동의 상태 변경 검사 | **판매 HOLD** |
| 본인 관계운+첫 비교 | 원국 T8과 T10을 단순 병치하지 말고 각각의 해석 출처와 범위를 보존한다. | 묶음 구성의 두 해석 모두 정확한 구매·서명·Reader 경로 검증 | **판매 HOLD** |

**검토한 실제 MyeongHa 현재 코드:** `apps/api/src/commerce-approved-saju-purchase-admission-v1.ts`는 각 구성의 Offer/현재 승인 Release를 확인하며, `apps/api/src/saju-production-reading-issue-source-v1.ts`는 Saju issuer 서명·기간·원본 해시·발급 맥락을 검증한다. 이들은 '학술 전문가 승인'이 아니라 **기술·권리·운영 계약**이다. 해석 정책을 바꿨다는 이유로 이 보호 장치를 우회하지 않는다.

## 출시 적격성 판정의 두 단계

**① 해석 트랙 준비:** 채택 내부 의미 규칙 구현, 실제 사람·기간 입력에 대한 문단/모순/지원 범위 검사, 서명된 Saju Official Artifact 및 정확한 MyeongHa Reader 연결의 통합 검증, 관련 로드맵/이슈 갱신이 확인될 때만 완료.

**② 전체 판매 개시:** ① 이후에도 실제 결제/PortOne, 운영 DB, 민감정보 및 동의/철회, 환불·복구, 운영 배포와 정책을 각각 증명해야 하며 자동 판매 열림이 아니다.

**이번 변경:** 현재 연결 정책을 교체·문서화한 것. 아직 해석이 완성되지 않은 범위를 '완료'로 만들거나 테스트용 승인/Release를 운영에 허용하지 않는다. 실제 코드·테스트·CI는 각 PR 커밋과 별도로 추적한다.

## 2026-11-13 추가 구현 — 연·월운 서명 발급 및 재열람의 동일 근거 보존

- **발급 시** `apps/api/src/saju-production-reading-issue-source-v1.ts`의 실제 검사에서 연운/월운이라면 호출자 옵션이 비활성 상태여도 두 기간을 모두 포함하는 **서명된 원본 Reader 자료**를 요구한다. 구매 기간·원본 응답·문단 연결을 임의로 우회하지 않는다.
- **보관함에서 다시 열 때도** 같은 자료가 없거나 서명·원본 해시·연/월 기간이 불일치하면 복원을 거부한다. 종전의 '서명은 있지만 Reader 원본이 없는 유료 연·월운' 자료를 정식 해석으로 간주하지 않는다. 비기간 상품의 기존 계약은 그대로 둔다.
- `apps/api/src/saju-production-reading-temporal-issue-source.test.ts`에서 월운/연운의 실제 두 구간 서명→보관→Reader 설명 유지, 소스 없는 유효 서명 거부, 연운·월운 구매 범위 바꾸기 거부를 검증한다.
- **업스트림 Saju** `src/host/production-reading-issue-proof.ts`도 연·월운 원본이 없으면 서명 자체를 발급하지 않도록 맞췄다([Saju #2762](https://github.com/gycha0109-beep/Saju/pull/2762)).
- **미완료:** 명하 내부 채택 T9 본문을 실제 Official 해석으로 확정·승격하는 검증, 구매/동의/서명·운영 DB·실결제·환불·복구 E2E; T10 세 관계 비교 상품의 두 명식 보호 발급과 상대 동의·Reader 결속. 기존 임시 실행 데이터를 운영 승인으로 취급하지 않는다.

## 2026-11-13 관계 비교 연구 인계 추가 구현

- Saju #2763의 사내 채택 T10 일지 합·충/양면성 설명을 **서명된 비공개 두 명식 검토 응답**으로 이관한다. 기존 자체 계산/출처 감사 및 명하 구매/동의/발급 주체를 바꾸지 않는다.
- `apps/api/src/saju-held-pair-review-v1.ts`는 검토 응답의 **두 사람 계산 해시, Saju 관측 사실 경로, 내부 규칙/문장, 관계 결과 비단정 및 연구용 미판매 상태**를 확인하며, 서명 응답이더라도 실제 명식 원본에서 벗어난 설명이나 `readyForOfficialIssue=true` 반환을 거부한다.
- 연관 테스트 `apps/api/src/saju-held-pair-review-v1.test.ts`는 정상 서명 연구 검토·인물 해시 바꾸기·허구 근거 경로·공식 발급 승격 시도 거부를 검사한다.
- **남은 필수 단계:** 첫 상대/추가 상대/본인 T8+첫 상대 구성 각각의 구매·동의·출생 revision/상대 권리, **서명된 Official T10 Reading** 발급, Reader 보관함/재열람, 환불/철회·실결제·운영 복구 E2E. 현재 연구 검토 통과는 발급/판매 허가가 아니다.

## 2026-11-13 — 관계 비교 3상품의 결제 당시 선택·동의·두 명식 묶음 검증

- **기존 공식 발급 블로커 유지:** 현재 Saju 생산 발급 및 MyeongHa 발급 작업자는 단일 본인 명식 처리만 구현되어 있고, 관계 비교 `compatibility` 발급을 의도적으로 차단한다. 내부 서명 검토 결과를 운영 Grant로 승격하지 않는다.
- **이번 실구현:** `docs/operations/candidates/commerce_approved_saju_issuer_facades_v1.sql`의 `qry_approved_saju_pair_issue_scope_v1`은 기존 구매·현재 동의 잠금 검증을 통과한 다음, *동일한 승인 구매 기록*에서 정확한 상품 `first-counterpart` / `additional-counterpart` / `relationship-plus-first`, 첫/추가 상대 구분, 상대 ID, 사용 동의 승인번호를 읽어 반환하도록 확장했다. 외부 요청의 상품명을 신뢰하지 않는다.
- `apps/api/src/postgres-approved-saju-issue-scope-v1.ts`는 DB가 읽은 선택이 승인된 3개 상품의 구성/순서와 일치하는지, 두 출생 revision이 다른지, 상대 식별값/동의 번호가 유효한지 검사한다. 결합 구매만 `['relationship','compatibility']`, 다른 두 상품은 `['compatibility']`로 별도 유지한다. 산출된 `paidComparison.authorizedForIssue=false`는 그대로다.
- `apps/api/src/postgres-approved-saju-issuance-v1.ts`의 비공개 두 명식 소스 검토에서는 **해석 요청 전·후** DB 조회에서 상품·상대·승인번호·구성·해석 요청 해시·명식 revision·Release가 그대로인지 다시 검증한다. 구매 취소·동의 철회·상대 변경 시 신규 확인에서 null/HOLD를 유지한다.
- **검증:** `apps/api/src/postgres-approved-saju-pair-issuance-scope-v1.test.ts`와 `apps/api/src/postgres-approved-saju-pair-offer-handoff-v1.test.ts`에서 세 상품·양 명식·동의 및 구매 변경 거부를 검사한다. 이 작업의 SQL은 배포된 마이그레이션이 아니라 후보 문서이므로 운영 DB 적용이나 실제 결제 테스트 완료로 간주하지 않는다.
- **다음 필수:** 공식 T10 이중 명식 서명 Source 계약, 관계 구성별 DB 발급 작업, 실제 동의/철회/구매 영수증·중복발급·환불/Reader E2E. 기존 명하 운영 판매 HOLD.

## 2026-11-13 — 관계 비교 두 명식 원본 Reading 자료 검증

- Saju #2763에서 두 명식의 일간·일지 및 타주 합충을 독립 원본 경로와 연결해 조건부 **고객 한국어 풀이**를 보강하고, `saju-t10-pair-reading-material-v1`에 두 원국 식별값·각 문장/규칙/근거의 해시·전체 자료 해시를 결합했다.
- `apps/api/src/saju-held-pair-review-v1.ts`에서 이 자료를 기존 Bearer/Ed25519 서명 검증에 이어 확인한다. 잘못된 명식 대응, 문장·해시 변경, 원본 미첨부, 연구용 결과의 자의적 발급 승격을 거부한다.
- **현재의 한계:** 계약은 **비공개 서명 검토/정식 발급 준비 자료**이지 Saju Production Pair Issue Proof나 고객 저장/Reader 결과가 아니다. 최초·추가·결합 구매의 정식 전용 Issuer/서명/DB 연결은 구현하지 않았으며 실제 구매·동의/환불·복구 무결성 미충족 상태에서 판매를 열지 않는다.
