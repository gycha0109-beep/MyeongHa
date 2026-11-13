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
