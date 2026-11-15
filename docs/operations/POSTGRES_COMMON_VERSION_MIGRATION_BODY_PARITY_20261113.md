## 정확한 원본 SQL 진단을 위한 최신 개인정보 스키마 경계 — 2026-11-13

- [격리 복구 #43418694784](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43418694784)는 SQL 원장 비교 뒤에 **신형 shared-memory deletion replay migration 2380 부재** 때문에 합성 개인정보 정합성 단계에서 종료됐다. 비식별 원장 분류 아티팩트는 업로드되지 않았고, 해당 실행을 SUCCESS로 기록하지 않는다.
- 옛 백업 `43174606843`에 대한 정확한 SQL 출처 조사만 위해 보호된 `main` 수동 모드 `migration_source_only_diagnostic=true`를 추가한다. 원본 source SHA/버전/로컬 격리 복원/역할 출처는 검증하지만, **나중에 생긴 삭제 재생 기능의 합성 개인정보 검증은 이 출처 전용 경로에서 수행하지 않음**을 별도 JSON으로 명시한다. 전체 DR 모드는 계속 fail-closed하며 모든 서비스 재개/데이터·개인정보 복원 게이트는 HOLD.
- 병합된 후 최초 보호 실행의 실제 코드 토큰 분류 결과에만 근거하여 12개 미해결 SQL을 처분한다. 차이 토큰·원본 SQL·실행자 메타데이터는 출력하지 않는다.

## 12개 단일 SQL 본문 차이의 보수적 코드 토큰 비교 — 구현, 실제 검증 대기

- 기존 SHA 검증 봉인 원장과 정확한 체크아웃 main 파일을 **같은 보호 runner 안에서만** 읽고, 바이트가 다른 단일 SQL에 `sqlCodeLexicalObservation`을 부착한다. 주석과 SQL 코드 토큰 간 공백은 비교에서 무시하지만 인용 문자열·식별자·달러 인용 본문은 재구성하거나 정규화하지 않는다.
- 분류는 `CODE_TOKENS_IDENTICAL_IGNORING_TRIVIA`, `CODE_TOKEN_BYTES_DIFFER`, `LEXICAL_SCAN_INDETERMINATE`. 알 수 없는 문법은 안전하게 마지막 분류로 보류. 토큰·SQL 본문·리터럴·변경 조각·실행자·인증정보는 **절대 출력하지 않는다**.
- 이는 완전한 PostgreSQL 파서 검증이 아니며 실행 효과·의미 동등성·권한·RLS·역사적 적용의 증거가 아니다. 13 byte-exact, 187 비일치/보류 및 `drReady=false`는 그대로 유지한다. 합성 7건 통과. **운영 백업 실제 실증은 이 문서 작성 시점에 아직 없다**.

## 기존 암호화 원장의 실제 차이 위치 관측 — 2026-11-13

- 보호된 main [격리 복구 #43406911458](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43406911458) SUCCESS. source run #43174606843, exact checkout `b88fde700f8fcc40ee7c224f3a0d7ffc3a04603a`.
- 단일 SQL 불일치 21개 전체에 대해 원본 SQL을 보호된 격리 runner에서 바이트 비교했다. **repo 종결자 `0x3b0a` 추가 9**, **source suffix 76바이트 추가 2**, **서로 다른 내부 구간 10**. [21개 분류·길이·해시·출처 비식별 증거](POSTGRES_COMMON_VERSION_MIGRATION_BYTE_DIFFERENCE_REAL_PROOF_20261113.json).
- 원본 242/저장소 276/공통 200 및 분류 13 exact·21 bytes differ·154 multi-statement framing unproven·12 NULL은 변경되지 않았다. 현재 SQL 의미/DDL·owner·권한·RLS 복구 동일성이나 역사적 실행 인과관계는 **미입증**. 따라서 Phase 8-A와 DR 서비스 재개 HOLD 유지. 이전 '실증 대기'는 시점별 역사 기록이다.

## 12개 미해결 단일 원문 SQL 차이 위치 보강 — 실제 측정 전

- 2026-11-13 실제 전수 비교에서 21개 단일 statement 바이트 불일치. [비식별 후속 지문 대조](POSTGRES_COMMON_VERSION_MIGRATION_SINGLE_STATEMENT_FINGERPRINT_TRIAGE_20261113.json)에 따르면 9개는 원본 statement와 저장소 파일 앞부분의 SHA-256이 정확히 일치하지만, 12개는 한정된 형식 변환만으로 설명되지 않았다.
- 봉인 원본은 외부에 꺼내지 않고 **기존 격리 복구의 복호화 시점**에만 바이트 공통 접두/접미 길이와 각 진영의 다른 구간 길이 및 차이 위치 유형을 산출하도록 구현했다. 결과 객체 `rawByteDifference`에는 원문·실행자·변경된 조각이나 해당 조각의 해시를 포함하지 않는다. `repositoryTwoByteTerminatorSuffix`는 2바이트 `0x3b0a`의 단순 관찰이며 SQL 의미 동등성의 증거가 아니다.
- 기존 byte-exact/비일치/NULL/다중 SQL 판정은 유지한다. 이 기능은 실제 보호 runner 실행이 끝나기 전에는 **실증 완료**로 간주하지 않는다. `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false` 유지.

## 실제 원장·저장소 본문 비교 결과 — 2026-11-13

- [복구 실행 #43372543611](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43372543611) SUCCESS, 정확한 main `ccf52e1132f9afb6b956ebb399dc380154719d74`, 재사용 백업 `43174606843`.
- 공통 200개 중 단일 raw-byte exact 13개, 단일 bytes differ 21개, multi source framing 미입증 148개, multi reconstructed-match source-framing 미입증 6개, 원문 없음 12개. [전체 분류·지문·아티팩트 무결성](POSTGRES_COMMON_VERSION_MIGRATION_BODY_PARITY_REAL_PROOF_20261113.json).
- 기존 '실측 미실시' 문장은 구현 시점의 이력이다. 불일치·다중 구문을 함부로 동등화하지 않고 Phase 8-A 후속 처분을 계속한다. `drReady=false`, #1887 OPEN.

# Production Operations — 공통 버전 마이그레이션 SQL 본문 일치 검증

> 적용 트랙: `ops` / Gate 1·Phase 8-A / P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 기존 실증 근거

- 2026-11-13 읽기 전용 원장 봉인·격리 복호화 및 정확한 저장소 버전 대조: [#43350336600](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43350336600) SUCCESS, source backup #43174606843.
- 당시 정확히 체크아웃한 `main`에서 원본 migration **242개**, 저장소 migration 파일 **276개**, 공통 버전 **200개**, 원본에만 있는 버전 42개, 저장소에만 있는 버전 76개를 확인했다. [증거](POSTGRES_SEALED_PROVIDER_MIGRATION_FILE_LINEAGE_PROOF_20261113.json).
- **공통 200개 버전의 실제 SQL 본문 바이트 일치 여부**는 버전명이 같다는 사실만으로 확인되지 않는다. 기존 문서에서 일부 개별 버전 및 동일 이름·상이 버전 쌍을 비교했지만, 공통 버전 전체의 raw-body 검증은 미실시 상태였다.

## 이번 구현

- `assess-sealed-common-migration-body-parity.mjs`는 검증을 통과한 암호화 원장 복호화 증거와 동일 작업에서 생성된 원장 버전 비교 증거를 묶어, **정확히 체크아웃한 `main` 커밋**의 `supabase/migrations/*.sql`과 공통 버전만 비교한다.
- 원장에 statement 1개가 있는 경우에만 실제 **UTF-8 원본 statement bytes**와 저장소 파일 bytes가 정확히 같은지 검증한다. byte-exact이 아닌 항목의 버전 ID·양쪽 SHA-256·길이만 비식별 기록으로 남긴다.
- 원장이 NULL/빈 statement인 경우 원문 부재, 배열 일부가 NULL인 경우 부분 부재, 다중 statement인 경우 **원문 파일 재구성은 비권위적**으로 분류한다. 다중 statement 재구성이 저장소 파일과 같더라도 byte-exact 적용 SQL 증명으로 승격하지 않는다. 동일 버전에서 이름이 다른 경우도 별도 분류한다.
- 산출물은 `paired-provider-common-migration-body-parity.json` 하나이며, 기존 `postgres-isolated-restore-drill.yml`의 보호된 `main` 수동 `verify_provider_migration_source=true` 옵션에서만 생성된다. 원본 SQL·작성자·개인정보는 로그·공개 아티팩트로 내보내지 않으며 임시 원본은 검증 완료 후 삭제한다.
- source packet SHA, 암호화 원본 복호화 성공, 원장 frontier, 대상 `main` 커밋·원격 전용/저장소 전용 버전 목록이 서로 맞지 않으면 실패 처리한다.
- **구현 검증:** 합성 테스트 3건, Node 문법 검사, Bash 문법 검사 성공. 실제 원본 242개에 대한 공통 버전 SQL 본문 결과는 PR 병합 후 보호된 격리 실행에서 별도로 실증해야 한다.

## 판정 경계

바이트가 정확히 일치해도 그것만으로 해당 버전의 실행자 인증, 당시 배포 인과관계, 현재 객체/권한 효과, Hosted Provider migration ledger 복원이나 서비스 재개를 증명하지 않는다. 전수 비교 결과는 복구 승인 게이트 대신 사용하지 않는다. 기존 SQL을 재실행·수정·생성하지 않는다.

`NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false` / #1887 OPEN. `ROADMAP_COMPLETE` 아님.

Watchtower-Track: ops
