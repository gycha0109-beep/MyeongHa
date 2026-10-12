# G0 D-03 — 원본 PostgreSQL JSONB / Node 모델 Context 해시 분리 및 Golden 검증 v1

> Watchtower-Track: security
>
> Status: **OFFLINE EXPERIMENT / OWNER DECISION OPEN** · 날짜 2026-10-12 KST
>
> Tracking: Draft [#1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985) · [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843) · [G0 Proposal](./SEYEON_G0_PERSONAL_SOURCE_AND_DERIVED_DISCLOSURE_CONTRACT_V1_PROPOSAL.md)
>
> 적용 범위: isolated PG `myeongha_seyeon_positive_pin_candidate_test`. **운영 마이그레이션·positive Projector·권한 서명 아님.**

## 1. 이미 코드에서 확인된 사실

1. `packages/domain/src/registry.ts`의 `canonicalJson`은 JSON 객체의 키를 정렬한 뒤 `JSON.stringify`로 직렬화한다. 비 JSON 값은 거부한다. 문자열 내용/기본 형식이 같아도 PostgreSQL `jsonb::text`와 일치하는 바이트 표현이라는 보장은 없다.
2. `apps/api/src/seyeon-production-context-v1.ts`의 source 후보 `rawRecordDigest`와 `projectedMemoryDigest`는 모두 `sha256:v1:` + Node `canonicalJson` 기반이다. **rawRecordDigest는 현재 RecordKind/RecordId/GrantId/Type/Schema/원본 payload를 묶은 앱 envelope hash이며 단순 DB payload hash가 아니다.**
3. `apps/api/src/seyeon-exact-model-personal-source-selection-v1.ts`의 `selectedSourcesDigest`는 정렬·선택된 `selectedSources` 배열의 Node `canonicalJson` 해시다. Provider 입력 전체의 현재 권한이나 실제 DB Pin임을 의미하지 않는다.
4. 격리 후보 `test/db/seyeon_positive_grant_attempt_bound_candidate_v1.sql`은 `sha256:pg-jsonb:v1:` + `sha256(convert_to(content_jsonb::text, 'UTF8'))`를 `original_raw_digest`에 보존하고 동일 알고리즘으로 Commit/Reveal에서 검증한다. **앱 envelope 해시와 DB payload 해시는 의미·바이트 표현이 다르므로 직접 비교 금지.**
5. PostgreSQL 함수는 원본 Record/Grant 행의 권한 검사를 별도로 수행한다. Digest 단독으로 개인정보 접근 권한·원본 Grant ID·Subject 소유권을 증명하지 않는다.

## 2. 기존 DB/Node 체계의 역할 분리 — 제안(Owner 미승인)

| 항목 | 비교 기준 | 시행 단계 | 실패 기본값 |
| --- | --- | --- | --- |
| `dbRawDigest` | DB-authoritative 동일 원본 JSONB payload의 현재 직렬화/codec 버전 | G1 Pin, G2 동일 Tx Grant/Record 재검증, G3 Reveal | 같은 버전의 bytes mismatch이면 HOLD |
| `appRawEnvelopeDigest` | Node `canonicalJson`의 Type/Schema/Record/Grant/Payload envelope | source-side projection 후보와 앱 내부 검증 | 다른 kind/codec/string이면 HOLD |
| `projectionDigest` | 모델용 `SeyeonRetrievedMemoryV2` 의 Node JSON 구조 | Projector 및 final selection | Memory 내용/버전 변경 시 HOLD |
| `selectedSourcesDigest` | 최종 선별된 source 참조 집합 | DB Owner 제출 전 앱 검증 | 집합 누락, 정렬/상한 변경 HOLD |
| `finalProviderInputDigest` | **실제로 전달된** Interpreter/Renderer/Reviewer/Preflight 입력 구조 전체 | Provider 앞/후 versioned source closure, 추후 Owner 승인 | 사후 추가 Context를 이전 Pin으로 포장하면 HOLD |

### 선택해야 하는 G0 D-03 기술 결정

- **D-03-A**: 현재 PG `jsonb::text` 직렬화 + 별도 앱 envelope hash를 **서로 다른 명시적 codec**으로 유지할지, 양쪽이 동일 canonical byte spec을 공유할지. 자동 변환 또는 이름만 바꾸기 금지.
- **D-03-B**: 원본 Record 식별·Type/Schema·exact Grant를 DB Pin envelope에 어디까지 묶을지, raw payload 변경과 Reference만 변경한 사례를 어떻게 독립 감지할지.
- **D-03-C**: PostgreSQL 15·17 및 Node 런타임·숫자·Unicode/Normalization·JSON key ordering·null·escape·array/nested 처리의 golden corpus와 향후 재검증/버전 전환 정책. 실측 PG version별 표본을 동일 기대값이라고 단정하지 않는다.
- **D-03-D**: 기존 0건 Pin, 양수 source Set, 역사 파생 Context closure의 개별 해시/신원/변경 보호 범위 및 migration scheme. 구 Attempt pin을 새 알고리즘으로 소급 재해시하지 않는다.

**제안적 안전 규칙:** DB에서 만들어진 source blob과 그 codec 버전이 검증될 때만 DB raw digest로 취급한다. `sha256:v1:<hex>` 문자열을 `sha256:pg-jsonb:v1:<hex>`로 바꿔 적거나 앱에서 전달한 Digest 자체를 DB 권한으로 믿지 않는다. 모델 입력의 구조가 달라지면 별도 선택·출처 폐쇄 집합 검증 후 다시 Pin 여부를 결정해야 한다. **어느 쪽도 승인 전 Production 임의 활성화 금지.**

## 3. 재현 가능한 테스트 및 정확한 통과 의미

- 파일 `test/seyeon-source-digest-node-postgres-golden-v1.test.ts`: 실제 disposable PostgreSQL `$1::jsonb::text`와 Node `canonicalJson`으로 empty object, key order/whitespace, nested JSON/null/decimal, Unicode/escape, array를 각각 계산한다. PG `sha256(convert_to(jsonb::text,'UTF8'))`와 Node SHA-256의 **각 체계 내부 일관성**을 검사하고 codec tag를 서로 혼동하지 않는다.
- 기존 SQL 후보에서 저장한 실제 Attempt Pin의 `original_raw_digest`를 원본 Memory row의 PostgreSQL JSONB와 **같은 알고리즘으로** 다시 읽어 대조한다. 테스트가 읽는 PG는 `CI=true`, `PGHOST=localhost`, 고정 폐기 DB, `SEYEON_POSITIVE_GRANT_REAL_PG=1` 모두 충족할 때만 활성화된다.
- 실행: `test/db/seyeon_positive_grant_candidate_real_http.sh`는 이 검증을 현재 테스트용 positive Pin→합성 Commit→Node HTTP current-Grant Reveal과 **같은 격리 DB 실행**에 추가한다. 새로운 GitHub Actions workflow나 Production 권한을 만들지 않는다.

## 4. 판정 경계

- **테스트 PASS**: 지금 설치된 disposable PostgreSQL과 Node가 **각자 동일한 직렬화 바이트를 다시 해시하는지**, 기존 synthetic Attempt Pin DB digest가 복원되는지만 증명.
- **테스트 미증명**: PG15/PG17 교차 보증, DB와 앱 canonical algorithm 상호 변환, 안전한 key management/HMAC, 모델 문맥 전체 해시와 실제 유료 Provider payload 결속, SRC-25 승인, positive Grant 해제, 운영 DB G1/G2/G3.
- DB·Security·Character Owner가 `D-03-A~D`에 대해 `policy_version + codec_version + authorizer + exact PR SHA + golden evidence`를 서명하기 전 **G0 D-03 = OPEN**. 신규 schema/migration/운영 Adapter 미적용.

## 5. 단계 기록

| Phase | 목적 | 변경 파일 | 검증 | 미해결 |
| --- | --- | --- | --- | --- |
| D03-01 | 실제 PG/Node 직렬화 차이를 재현 | `test/seyeon-source-digest-node-postgres-golden-v1.test.ts` | isolated PG + Node Vitest | Cross-runtime byte codec 계약 미승인 |
| D03-02 | G1 시험 Pin과 D03 증거를 같은 폐기 DB에 결속 | `test/db/seyeon_positive_grant_candidate_real_http.sh` | 기존 `db-authority-core` | 운영 G1/G2/G3 무변경 |
| D03-03 | Owner 결정 항목 및 다음 구현 의존성 고정 | 본 문서 + G0 제안서 | PR exact SHA / CI | DB+Security+Character Owner sign-off 필요 |

종료 분류: **B(격리 검증 기술 결과 성공 시) / C(운영 계약 미승인)**. PASS/미실행 여부는 해당 PR **정확한 HEAD의 GitHub CI**를 근거로 추가 기록한다.
