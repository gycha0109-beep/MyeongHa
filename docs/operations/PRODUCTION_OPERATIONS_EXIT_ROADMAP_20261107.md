## 2026-11-13 Gate 1 / Phase 8-A — current 242/276 exact-version inventory reconciled

- PR [#3259](https://github.com/gycha0109-beep/MyeongHa/pull/3259) merged after Integration CI SUCCESS. Protected main [#43350367171](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43350367171) actual encrypted source decryption and exact-main version/name comparison SUCCESS, source run #43174606843. Source **242** versions (frontier `20261109071019`), repository **276** files: exact matching **200**, source-only **42**, repository-only **76**, same-version/different-name **0**. Historical 2026-11-07 source-only **41** remain source-only; newly observed source-only is only `20261109071019`. Exactly-one-to-one name-matched different-version pair is `20261029012948`↔`20261029012000`, without overriding the eight legacy manually analyzed pairs.
- Additional Production `READ ONLY` metadata check on 2026-11-13 confirms 242/frontier unchanged, new Admin A4 source row has one 5,512-byte statement with SHA-256 `974840e6f7ef77717983ed2baec7e2f08712b9ea2048456f2f907f06388992e8`. Original text not returned. The original 41-disposition snapshot remains immutable and new 42-current delta is recorded in [2026-11-13 delta](POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_DELTA_20261113.json), with full inventory evidence artifact #14002903484 (ZIP SHA-256 `9432441c41030f0702c93d570b3514e3c43798ac2bfdeb49c16cad61c3329e9f`).
- **Narrow closure only:** version metadata inventory confirmed. This does not prove applied SQL, object/owner/ACL/RLS/current DDL parity or Hosted Provider equivalence. 12 source NULL SQL bodies remain and target ledger has not been restored. No migration repair, historical SQL replay or Production writes. P0 #1887 OPEN; `NOT_ACCEPTED` / `drReady=false` / `serviceResumptionAllowed=false`.

## 2026-11-13 Gate 1 / Phase 8-A·8-B — direct role replay observed in isolation

- PR [#3255](https://github.com/gycha0109-beep/MyeongHa/pull/3255) merged. Protected main [#43343813577](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43343813577) actual disposable PG17 restore and sealed-source verification SUCCESS. The guarded independent proof confirms source cross-boundary role edges **48**, executed isolated replay **48**, observed target edges **48**, and directly observed grant options/grantor attribution match. The source filtered roles.sql still excludes all 48; this is a staged disposable replay, **not** a portable Provider/Hosted restore guarantee. [Exact evidence](POSTGRES_ISOLATED_PROVIDER_ROLE_REPLAY_REAL_PROOF_20261113.json).
- Previously proven same-run source ledger decryption remains valid (242 history entries / 12 NULL statement bodies). Target Provider migration ledger was not restored. No new Hosted DR target or Production writes were performed. Full application/Provider equivalence and Auth/Storage/privacy/RPO/RTO remain Phase 8-A through 8-D blockers; #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. The approved roadmap's scope does not change.

## 2026-11-12 Gate 1 Phase 8-A/8-B: actual paired Provider source decryption proof

- [PR #3251](https://github.com/gycha0109-beep/MyeongHa/pull/3251) merged. Protected main isolated restore [#43179685582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43179685582) SUCCESS using same-run backup and encrypted Provider history from source backup [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843). **Actual decryption and SHA/full original statement-history fingerprint verification pass** for 242 versions and frontier `20261109071019`; historical SQL bodies are missing for 12 entries.
- Isolated application comparison: 3/3 schemas, 94/94 tables and 322/322 routines present, with 2 schema + 8 table + 19 routine legacy ACL-digest differences, although observed direct recipient privileges and canonical grantor entries match for those objects. Application internal role graph: 43/43 roles and 7/7 edges (portable grantor rewrites); app↔external boundary edges: observed 48/48 on isolated target but original filtered `roles.sql` excludes all 48. **This does not prove Provider role ownership, inherited access, full schema/permission or Hosted service parity.** A shared source/dump MVCC snapshot is unproven. Detailed [paired decryption evidence](POSTGRES_PAIRED_PROVIDER_LEDGER_DECRYPTION_PROOF_20261112.json).
- This closes only the optional **source-ledger decryption/integrity subtask**, not Phase 8-A/8-B/Gate 1. No target migration ledger replay, no repair, no Hosted Auth/Storage restoration, no Production writes, no privacy canary. P0 #1887 remains open, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. Approved remaining Gate 1 tasks remain exactly as enumerated below; no scope additions.

# Production Operations — 종료 집중 로드맵

## 2026-11-12 current-frontier Provider source capture + isolated restore evidence

- Production SELECT-only encrypted Provider source run [#43174606843](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43174606843) SUCCESS: 242 original history rows, catalog SHA `91f24b544486d2cd9af2ef8694278c80e9a2a40a7e93a3aeedf14250d08e3a47`, 12 NULL statement bodies. Archive ciphertext integrity matches public manifest and checksum; see [sealed-source evidence](POSTGRES_PROVIDER_LEDGER_SEALED_CAPTURE_REAL_RUN_20261112.json).
- Matching backup isolated restore [#43176401912](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43176401912) SUCCESS; entire schema/role/Provider migration equivalence **not** passed, service gate BLOCKED. See [current-frontier isolated evidence](POSTGRES_CURRENT_FRONTIER_ISOLATED_RESTORE_20261112.json).
- Phase 8-A/8-B next boundary: verify that exact same-run encrypted original history can be independently decrypted and re-fingerprinted **in disposable isolation only**. No target migration-history write, schema repair, or historical SQL replay is permitted. That verification alone will not close Phase 8 or alter Gate 1/P0 conditions. Whole roadmap scope unchanged.

## 2026-11-12 evidence addendum — Gate 1 migration ledger source HOLD (no roadmap scope change)

- PR [#3239](https://github.com/gycha0109-beep/MyeongHa/pull/3239) merged; exact-main isolated [#43158737963](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43158737963) completed successfully. The observed local Provider migration history table is **absent** in disposable CLI 3.1.0/PostgreSQL17; source 242 entries/frontier 20261109071019 **cannot be compared to target null metadata**. Evidence: [POSTGRES_PROVIDER_MIGRATION_LEDGER_ABSENCE_20261112.json](POSTGRES_PROVIDER_MIGRATION_LEDGER_ABSENCE_20261112.json).
- The existing sealed backup deliberately **excludes full migration history rows**, retaining count/frontier/fingerprint only (see [Backup Runbook](POSTGRES_BACKUP_RESTORE_RUNBOOK_V1.md)). This does not supply reconstructable Provider migration records. Phase 8-A/8-B therefore requires a separately authorized source and read-only identity/SQL/object/permissions equivalence before any supported isolated recovery route.
- Existing 93/93 Provider row and Auth FK proofs are **reused**, not repeated. Hosted Auth/Storage, current-frontier service restore, privacy continuity and service RPO/RTO remain unproven; P0 #1887 OPEN, `NOT_ACCEPTED`, `drReady=false`, `serviceResumptionAllowed=false`. Phase 8 and full roadmap remain incomplete.


> 기준일: 2026-11-07 KST  
> 트랙: `ops` / 저장소: `gycha0109-beep/MyeongHa`  
> 기준 main: 최초 `2f04f8f2a0d912e42bf348781e17d20ff7094675`; 최신 백업 source `8ccf60d89eb6d3fab789fb34e0d479c51d84b9af` (각 증거는 자체 SHA 기준)  
> 권위 문서: `docs/architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md` §33–§38, `PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md`, Phase 8 DR 문서 및 Issue [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)

## 1. 개정 목적과 유지 범위

이 문서는 Production Operations의 기존 13단계 목표·필수 수용 기준을 바꾸지 않고, 2026-11-07 현재 확보된 실증을 재사용해 **남은 차단과 최종 수용 검증에 작업을 집중**하도록 실행 순서를 개정한다.

- 최종 목표는 기존과 동일하다: 명하 Production을 관찰·격리·복구할 수 있고, 실제 용량과 확장 판단 근거를 갖춘 운영 체계.
- Phase 1–13과 Architecture §33의 14개 Production 검증 항목, §34 장애 행렬, §35 필수 Runbook은 그대로 유지한다.
- 이미 통과한 비운영 실증을 이유 없이 반복하지 않는다. 새 배포·구성 변경 또는 기존 증거의 범위 불일치가 있을 때만 해당 검증을 갱신한다.
- Phase 1–7 및 9–10은 새 기능을 다시 구현하는 트랙으로 되돌리지 않는다. 남은 항목은 Phase 13 최종 수용에서 필요한 증거만 보완한다.
- Production SQL/DDL, migration repair/deploy, 계정·토큰·Storage, 비밀, 트래픽, 유료 리소스 변경은 이 로드맵만으로 승인된 것으로 간주하지 않는다.

**현재 판정:** `NOT_ACCEPTED` / P0 [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887) OPEN / `dr_ready=false` / `serviceResumptionAllowed=false`.

## 2. 현재 기준점 — 이미 확보한 증거

| 영역 | 현재 확인된 사실 | 수용 범위와 한계 |
|---|---|---|
| Production Worker 익명 E2E | [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975), main `1609aa8…`, Worker `295b9496-795b-44a3-b3f9-141c0b83e47d` | 화면·Health 200, 설정 기반 Readiness 200, 익명 Member/Saju/Preview 401, Cross-origin 403, unknown route 404. 실제 DB/Auth/Saju 연결 증명은 아님. |
| Production DB 현황 | PostgreSQL 17.6, 원격 migration 원장 241개, 최신 `20261105075227` | 읽기 전용 관측. 전체 저장소 SQL/DDL/권한 동등성은 미증명. |
| Migration 비교 | Production 241개 / main SQL 276개. 정확한 버전 ID 기준 원격 전용 41개·저장소 전용 76개이며, 동일 이름의 버전 불일치 쌍 8개가 포함됨. 이 중 4개는 전체 byte 일치, 4개는 저장소 파일 끝의 `\n\ncommit;\n` 10 bytes를 제외한 원격 prefix 일치, 1개(`20261029012948` ↔ `20261029012000`)는 전체 byte 일치. | 위 쌍은 최신 SELECT-only 비교에서 원격·저장소 SQL 전체 7,349 bytes가 MD5/SHA-256까지 일치함을 확인. 버전 ID 및 배포 provenance는 별도 미해결. 원격 `20261008090417`은 104,021 bytes, 6개 로컬 marker는 비어 있고, 후속 1520–1640 13개와 Pin 컬럼/함수가 현재 Production에 존재함. 상세는 [11/07 read-only snapshot](POSTGRES_MIGRATION_METADATA_OBSERVATION_20261107.json). |
| 현재 Frontier 백업 | [#42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582), 암호화 artifact `13548176984`, source `8ccf60d…`, frontier `20261105075227` | **정확히 이 백업**을 사용한 격리 PostgreSQL 17 복원 [#42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923) SUCCESS 확인. 이는 Provider-managed 전체 복구·독립 개인정보 연속성·DR 서비스 재개의 증거가 아님. |
| 격리 PostgreSQL 복원 | **최신 대상 백업** [#42375717923](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42375717923), 증거 artifact `13575965386`, source migration 241개 / frontier `20261105075227` | 격리 복원·source catalog fingerprint 및 합성 Privacy 4건 확인. Provider COPY 27블록(138행) 제외·3블록(77행) 투영, 257행 replay(투영 포함). Hosted Auth/Storage·완전한 provider ledger·실사용자 개인정보 연속성은 미증명. |
| 개인정보 원장 | 최신 확인 [#42352614447](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42352614447), artifact `13566018275`, 암호화 캡처 SUCCESS. | payload 이벤트 수·누락 없는 연속성은 이번 조회에서 미인증. 최신 감시 [#42363914282](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42363914282)는 9,582초로 7,200초 기준 초과 RED. 이전 0건 스냅샷을 non-zero 증거로 사용 금지. |
| Phase 11 제품 경로 | [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347) | 격리 GoTrue JWT + PG18 RLS + 실제 Saju + local workerd, 900초·3,600/3,600 성공, p95 174.231ms / p99 184.088ms, Saju 장애 503·Health 200·복구 4/4. Production Worker admission/Hosted Hyperdrive/Production capacity 증거는 아님. |
| Phase 12 진단 | `OBSERVED_SCALING_REVIEW_PHASE12_20261030.md` | DB pool 2개 조건에서 concurrency 8 실패 및 Saju CPU 제한 압력 신호 확인. 진단 신호이지 Production 임계치나 자동 확장 승인 아님. |

참고: [PR #3092](https://github.com/gycha0109-beep/MyeongHa/pull/3092)의 최신 Worklog에는 현재 main 익명 E2E, 개인정보 원장 노후화, migration source parity 분석이 추가 기록되어 있다. PR 병합 전후에는 반드시 새 main SHA와 최신 관측을 다시 읽는다.

## 3. 종료 실행 순서

### Gate 0 — 기준선 고정

1. 이 로드맵과 최신 운영 Worklog를 main에 반영한다.
2. 병합 직후 main SHA, 최신 Worker version, Production migration frontier, 최신 백업·개인정보 원장·감시 결과, #1887 상태를 다시 읽는다.
3. 과거 성공 결과를 새 배포 버전이나 새 백업 frontier에 자동 승격하지 않는다.

Gate 0은 문서 병합 및 기준선 동기화일 뿐 Production 수용 완료가 아니다.

### Gate 1 — Phase 8: DR 복구 차단 해소 (최우선 P0)

Phase 8은 다음 네 묶음을 모두 닫아야 한다. 백업 생성이나 격리 PostgreSQL 복원만 반복해서는 종료할 수 없다.

#### 8-A. Migration / DB 출처 정합성

1. 현재 Production 원장과 정확한 main migration 파일을 SELECT-only로 대조했다. 2026-11-07 기준 원격 241개 / 저장소 276개이며, 정확한 버전 ID 기준 원격 전용 41개 / 저장소 전용 76개다. 동일 이름의 버전 불일치 쌍 8개는 아래 4번과 같이 개별 SQL 본문/종료 구문을 대조하며 version identity는 별도로 유지한다.
2. 불일치 버전은 확인 가능한 배포/자동화 출처·시점, 저장소 대응 파일, statement/DDL checksum, 객체·함수·정책 영향, owner·role·membership·GRANT/REVOKE, rollback/forward-only 방향으로 처분한다. R2-G에서 종료한 과거 개인 실행자·요청 ID·COMMIT 로그 추적은 `CLOSED_RISK_ACCEPTED`이며 다시 차단 조건으로 만들지 않는다.
3. `20261008090417`은 104,021-byte 원격 단일 statement다. 현재 Production에는 관련 1460–1510 marker 6/6이 존재하지만 저장 statement는 모두 비어 있고, 후속 1520–1640 13개 migration·Pin 컬럼 2개·pinned 함수가 이미 존재한다. 현재 investigation은 `HOLD_CHANGED_RUNTIME_SCHEMA_REASSESS`다. 19개 R2 RPC catalog는 19/19 존재하며, `myeongha_api_executor` EXECUTE 17/19, `service_role`·`anon`·`authenticated`는 0/19다. 거부된 두 함수는 legacy assert/context-ready 경로이고, 현재 pinned context-ready replacement는 1 overload로 존재하며 API executor 실행이 허용된다. 이것은 현재 접근 경계의 증거이지, 원격 wrapper·전체 DDL·Owner·role membership·정책·grant graph의 격리 복원 parity 증명은 아니다.
4. `20261029012948` 원격 statement와 `20261029012000` main 파일은 현재 Production에 대해 SELECT-only로 직접 비교했다. 양쪽 모두 7,349 bytes이며 exact byte equality, MD5 `c13c8ae6680c9c5aef35909ba81b7b1b`, SHA-256 `b544d06947b31d3d6593ef29e611ac062fe86455caf23ac2f91925b839de86e6`가 일치한다. 정규화 SHA-256도 `0cfe257bb188bb8d40961959db6e0ca28f50236115e543eb72d0f283ea3bd53d`로 일치한다. 따라서 이 쌍의 SQL source equivalence는 확인됐지만 remote/local version identity와 적용 provenance는 해결되지 않았다. 원격 metadata의 `created_by`는 존재하나 인증된 실행자 증명은 아니며 idempotency key와 rollback statement는 없다.
5. 원격 전용 41개·저장소 전용 76개와 동일 이름/다른 버전 8쌍을 개별 처분한다. 현재 8쌍 중 4개는 byte-exact, 4개는 저장소 끝의 `\n\ncommit;\n` 10 bytes를 제외한 원격 prefix 일치다. Prefix 일치 4쌍은 SQL statement framing 차이를 기록하고, version identity 불일치를 자동으로 정리하지 않는다. 저장소 전용 76개를 자동 배포 실패로 분류하지 않는다.
6. 전체 schema, function, owner, role membership, grants, RLS/policy 및 provider migration ledger의 복구 동등성을 증명한다.
7. 현재 Production 기준으로 확인한 권한·정책 상태를 복구 기준으로 사용한다. 과거 bundle은 19 routine / 18 owner transfer / 19 policy이며 현재는 routine 19/19 존재, owner transfer 18/18 일치, 정책 19/19가 이름·테이블·명령·대상 역할 기준으로 일치한다. 관련 현재 정책은 38개로 후속 정책 19개가 추가되어 있으므로 과거 19개와 단순 개수 비교하지 않는다.
8. `myeongha_seyeon_chat_runtime_owner`의 현재 `postgres` 멤버십 2개 중 하나는 `20261104043413`에서 SET 권한을 임시 부여한 뒤 회수하며 남긴 비상속·비관리자·비SET 멤버십이다. 현재 `pg_has_role` 결과는 MEMBER=true / USAGE=false / SET=false다. 이 마이그레이션은 Production 원장에만 있고 main 파일은 없으므로 remote-only 처분표에 포함한다. 이전 1개 멤버십 postcheck는 현재 frontier 수용 조건으로 재사용하지 않는다.
9. 적용된 `1640` 원격 SQL(10,303 bytes)과 main 파일(10,147 bytes)은 권한 소유권 전환·회수 방식이 실질적으로 다르다. 원격은 owner 역할로 전환해 legacy EXECUTE를 회수하고 `GRANTED BY postgres`로 임시 멤버십을 제거하지만 main 파일은 `current_user`에 직접 회수한다. 이미 적용된 migration file/history는 수정·재적용하지 않고 source/provenance 차이로 별도 처분한다.
10. `20261026025332`는 원격 9개 statement를 재구성한 결과와 main 파일의 공백 제거 token stream이 일치한다. statement framing/version identity는 별도 유지한다.
11. Production 원장에만 존재하는 S0/Se-yeon migration 12개를 현재 권한·함수·정책 효과와 함께 처분한다. 이 중 `20261025193416` 및 `20261031182926`은 본문에 Production 미배포 문구가 있고 `20261031182505`는 disposable S0 전용 문구가 있으나 Production 원장에는 적용 기록이 있다. 현재 main에 대응 SQL 파일은 12개 모두 없다. `20261025193416`의 guard는 postgres 사용자/DB, PG17, private schema 부재만 검사하고 프로젝트/환경 식별자를 검사하지 않는다. 주석을 실제 배포 방지 장치로 간주하지 않는다.
12. `scripts/operations/production-authority-frontier-readonly.sql`을 추가하고 Production에서 read-only 실행을 확인했다. 역할/멤버십, 스키마 권한, 테이블·컬럼 ACL hash, RLS/policy hash, RPC 실행 권한 및 선택 migration metadata를 함께 기록한다.
13. RLS 비활성 테이블과 실제 접근 경로를 분리해 판정한다. `chat_turns`·`chat_turn_attempts`는 정책 정의가 각 3개 있지만 RLS 비활성이고 API executor 직접 테이블/컬럼 권한은 없다. 현재 G0 함수는 subject/thread 조건을 명시한다. `memory_proposals`는 정책 2개가 있으나 RLS 비활성이고, API/anon/auth 직접 권한과 신규 S0 proposal-accept EXECUTE는 없으며 positive-source registry도 disabled다. 이는 현재 fail-closed 경계이지 RLS 수용 완료가 아니다. 해당 유형을 활성화하기 전에 RLS enable 또는 승인된 동등한 행 범위 통제를 증명한다.
14. `cmd_commit_chat_turn_legacy_v1`은 service_role 전용의 별도 사용자 선택 기반 proposal 처리 경로이며 신규 positive-source registry를 참조하지 않는다. 신규 S0 proposal-accept 경로가 비활성이라고 해서 모든 legacy memory acceptance가 비활성이라고 판정하지 않는다.
15. `docs/operations/POSTGRES_REMOTE_ONLY_MIGRATION_DISPOSITION_20261107.json`에 원격 전용 41개 전체의 실제 원장 버전·SQL 본문 해시·statement 수·대응 저장소 버전·영향 신호를 기록했다. 분류는 Se-yeon 23 / Admin 8 / Commerce 8 / API DB Auth 1 / historical bundle 1이다. 이는 전수 목록 및 출처 추적 증거이지 41개 전체의 현재 객체/ACL/DDL 복구 동등성 증명은 아니다. 개별 대상 효과를 추가 대조한다.
16. 현재 `conversation_recall` registry는 `enabled=false` / `writable_enabled=false`지만 AI 모델 정책 2개는 active다. 2026-11-07 UTC 예산 행은 없고 10/25–10/31 예산 7개만 존재한다. 기존 AI 비용 원장 29건은 전부 settled이며 24건은 Owner 일일 한도 면제 플래그, 1건은 usage_unknown이다. 비용 원장과 positive-memory 경계는 동일한 stop switch가 아니다. 일반 사용자 daily admission은 해당 날짜 예산 부재로 fail-closed이나 Owner 별도 예외는 남아 있으므로 글로벌 AI 비활성 완료라고 판정하지 않는다. 새 호출·설정 변경 없이 SELECT-only로 확인했다.
17. 적용된 원격 전용 migration 41개를 대상으로 [읽기 전용 객체명 대조](POSTGRES_REMOTE_ONLY_OBJECT_PRESENCE_20261107.json)를 실행했다. SQL 선언 출현 횟수 기준 함수 82/82, 정책 82/82, 테이블 16/16이 현재 DB에 같은 이름·소속으로 존재한다. 이는 `CREATE` 텍스트의 이름 존재 확인에 불과하며, 함수 본문·소유권·권한·정책 식·실제 스키마·복구 DB의 동등성은 아직 미입증이다. 검증은 `scripts/operations/production-remote-only-object-presence-readonly.sql`로 재현 가능하다.

**금지:** blind `migration repair`, migration history rewrite, 추측에 의한 재적용, Production DDL/DML. 실제 정합화가 필요하면 근거 있는 forward-only 계획을 먼저 제시하고 사용자 승인을 받은 뒤 별도 실행한다.

#### 8-B. 현재 Frontier의 Provider-equivalent 복구

1. 현재 Production frontier를 고정한 암호화 백업과 checksum/catalog fingerprint를 사용한다. 백업 #42309503582 / artifact `13548176984` (source `8ccf60d…`, frontier `20261105075227`)를 사용한 **정확한 격리 복원 #42375717923이 SUCCESS**이며, evidence artifact `13575965386` / SHA-256 `a474462113eeb780f30f7bb996d7a400ac81fa6538657199cfd891ac3ab504b9`를 남겼다. 소스 catalog 241개 / fingerprint `b1076fcf360f3f12c1e3fcdadb34adec87e2f8c02b7592915bb6298db2e98600`를 검증했다. 이는 해당 백업의 PostgreSQL 격리 복원 증거만이며, frontier가 바뀌면 새 백업·연계 증거를 확보한다.
2. 최신 복원 #42375717923에서도 **27개 skipped(138행) / 3개 projected(77행) Provider COPY block**이 남았다. 합성 개인정보 복원 4건과 257행 replay(투영 포함)를 실제 Production 개인정보 연속성으로 승격하지 않는다. 이 누락을 해소할 Hosted-compatible 복구 경로를 확보하고 전체 Supabase migration ledger·Provider-managed 데이터의 실제 복구를 별도로 검사한다.
3. Hosted Auth는 사용자·identity 연결, sessions, refresh-token 관계, JWT signing configuration, MFA/SSO 등 해당 서비스에서 사용하는 상태를 복원하고 로그인·갱신·로그아웃·삭제 계정·폐기 토큰을 검사한다.
4. Hosted Storage는 bucket·metadata·policy와 실제 object bytes를 복원한다. synthetic object checksum, 허용된 다운로드, 비인가 접근 거부, 삭제·철회 후 접근 차단을 확인한다.
5. 복구 대상은 Provider-compatible isolated Hosted target이어야 한다. 현재 확인된 전용 DR target은 없다. 기존 Production `MyengHa` 또는 `Refund_management` 프로젝트를 임의로 재사용하지 않는다.
6. 새 Hosted project나 유료 리소스가 필요하면 생성 전에 비용·대상·부작용을 사용자에게 보고하고 명시적 승인을 받는다. 승인 전에는 프로비저닝하지 않는다.

#### 8-C. 독립 개인정보 연속성과 현재 Frontier Replay

1. 최신 백업과 정확히 결합된 개인정보 원장을 새로 확보하고, 감시기가 7,200초 freshness 기준 안에서 성공했는지 확인한다. 기존 #42262739511 RED를 무시하거나 freshness 한도를 완화하지 않는다.
2. 기존 #42242496615는 `eventCount=0`이므로 non-zero replay 증거가 아니다. 최신 암호화 원장 #42352614447 / artifact `13566018275`는 캡처 성공만 확인했고 이벤트 수·독립 연속성은 미인증이다. 최신 감시 #42363914282는 9,582초로 7,200초 freshness RED다. 과거 #40633679630도 다른 backup/ledger pair에 묶여 있으므로 현재 frontier 증거로 재사용하지 않는다.
3. Production disposable privacy canary는 사용자가 정확한 승인 문자열 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY`를 명시한 뒤에만 실행한다. 해당 canary는 합성 전용 계정·주체를 만들고 기존 삭제 API/worker 경로를 실행한 뒤 정해진 정리 절차를 수행한다. 승인 전 dispatch 금지.
4. 승인된 canary가 만든 non-zero Production event를 현재 backup과 같은 복구 증거 묶음에 결합하고, 격리 복원본에서 authoritative ledger를 재생한다. 2회 재생 idempotency, finalizer 완료, no-resurrection, stale JWT·Auth·Storage 접근 차단, 법적 보존 데이터 유지까지 확인한다.
5. 위 canary는 한 captured window의 replay 증거다. `futureSafePrivacyReconciliation=true`를 위해서는 Primary PostgreSQL 손실 후에도 살아남고 사고 기준 시점까지 누락 구간 없이 삭제·철회 이벤트를 제공하는 독립적인 durable source continuity를 별도로 입증한다. GitHub Actions freshness watcher는 감시 도구이지 독립 이벤트 원장이 아니다.

#### 8-D. 전체 서비스 RPO / RTO와 재개 게이트

- 승인된 목표는 기존 Product Owner 결정 그대로 RPO `PT24H`, RTO `PT6H`다. 값을 새로 만들거나 낮추지 않는다.
- 기존 authoritative isolated procedure의 5,536초 RPO / 67초 RTO 비교는 해당 절차의 목표 비교를 충족한 과거 증거다. Hosted Auth/Storage 전체 복구 동등성을 대신하지 않는다.
- 전체 복구 시험에서 백업 기준 시점부터 실제 복구 가능한 서비스 상태까지의 데이터 손실 구간과 전체 소요 시간을 측정해 각각 PT24H / PT6H 이내인지 확인한다. 4초 DB-only restore 또는 58,508초 synthetic reference interval을 전체 서비스 RPO/RTO로 사용하지 않는다.
- DB·Auth·Storage·Worker·Saju 연결과 삭제/철회·접근권한을 확인한 후에만 recovered-serving admission을 재평가한다.

**Phase 8 종료 조건:** migration/DDL/ACL/provider ledger 정합성, provider-managed full restore, Hosted Auth/Storage 복구, 독립 개인정보 연속성, future-safe replay, 전체 서비스 RPO/RTO가 모두 증거로 확인되고 `dr_ready=true`, `serviceResumptionAllowed=true`가 산출되어야 한다. 하나라도 빠지면 #1887은 OPEN, Phase 8은 BLOCKED로 유지한다.

### Gate 2 — Phase 11: 이미 성공한 실측 재사용 + 부족한 조합만 보완

기존 [#42244701347](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42244701347)의 15분 workerd overlap 제품 경로 실측은 유효한 격리 증거로 인정한다. 동일한 3,600건·4 req/s 시험을 이유 없이 반복하지 않는다.

남은 검증은 기존 증거에 없는 조합으로 한정한다.

1. 현재 제품 경로에서 DB pool acquisition timeout / DB unavailable 또는 slow DB가 발생했을 때 요청이 bounded-fail 되는지, Health가 독립 유지되는지, 복구 후 계산이 회복되는지 확인한다. 이미 통과한 Saju outage/recovery는 반복하지 않는다.
2. 필요한 경우에만 동일한 격리 workerd + GoTrue + PG + Saju 구성에서 DB 압력과 Saju 자원 압력을 구분 측정한다. 동시성·지속시간·성공/503/transport/skipped·p50/p95/p99·DB/Auth/Saju 시간·CPU/memory·복구를 하나의 sanitized evidence로 남긴다.
3. `productionWorkerAdmissionMeasured=false`, `hostedHyperdriveMeasured=false`, `productionCapacityProven=false`를 유지한다. 격리 실측을 Production 처리량이나 실제 Cloudflare/Hyperdrive 한계로 바꾸지 않는다.
4. 외부 Production 부하 주입이나 사용자 트래픽 실험은 하지 않는다.

**Phase 11 종료 조건:** 기존 overlap 실증을 포함해 제품 경로의 DB/Saju 주요 실패·복구 경계와 대표 비운영 자원 한계가 재현 가능하고, 모든 요청·오류·복구·정리 증거가 완전해야 한다. Production capacity claim은 별도 실제 Production 계측이 없는 한 계속 금지한다.

### Gate 3 — Phase 12: 확장 판단 기준 확정

1. Phase 11에서 검증된 DB pool·acquisition latency·Saju adapter latency·CPU throttling·memory·API p95/p99만 입력으로 사용한다.
2. 현재 관측된 concurrency 4의 clean 범위, concurrency 8의 DB pool 실패, Saju 0.01 CPU 압력 결과는 진단 근거이지 Production 확장 임계치가 아니다.
3. 측정된 대표 비운영 구성에서 확장/축소를 검토할 수 있는 지표, 관찰 구간, 지속 조건, 복구 여유, 수동 조치 기준을 명시한다. 숫자는 실제 반복 측정과 기존 서비스 목표에서만 도출한다.
4. `automaticScalingEnabled=false`를 유지한다. 수동 운영 기준과 Production 수치 임계치는 증거·사용자 승인 전까지 미승인으로 둔다. Health 단일 경로에서 degradation이 없었다는 결과로 확장 임계치를 만들지 않는다.

**Phase 12 종료 조건:** 확장·축소를 판단할 측정 지표와 경계, 근거 실험, 수동 대응 절차가 문서화되고 승인되어야 한다. 자동 확장 활성화는 이 로드맵의 목표가 아니다.

### Gate 4 — Phase 13: 최신 배포 버전 최종 수용

현재 Worker `295b9496-795b-44a3-b3f9-141c0b83e47d`의 익명 E2E는 통과했지만 Readiness는 configuration-only다. 다음 14개 항목을 동일한 최신 배포/소스 증거에 연결해 최종 판정한다.

| §33 항목 | 현재 판정 | 최종 종료에 필요한 증거 |
|---|---|---|
| 1–2. 소스 SHA / Provider 배포 | 부분 확인 | 현재 Worker version·100% traffic·build source SHA 및 Saju exact image digest를 같은 시점에 결합 |
| 3. Secret/config preflight | 미수용 | secret 값 노출 없이 필수 설정·rotation 상태·환경 분리 확인 |
| 4–5. Liveness / Readiness | 부분 확인 | Health 외에 실제 dependency/capability 상태와 degraded semantics 확인. config-only readiness를 연결 성공으로 간주하지 않음 |
| 6. Negative auth | 현재 Worker PASS | 익명 Member/Saju/Preview 401, cross-origin 403 등 exact-version 검사 유지 |
| 7–9. Positive auth / dependency / Saju compatibility | 현재 버전 미수용 | 기존 governed synthetic Member 경로를 정확한 최신 Worker version에 묶어 로그인·주체 귀속 DB·Birth revision·계산-only Saju 검증 |
| 10. Private no-store / CDN | 부분 확인 | 성공한 private 경로 전체의 no-store 및 CDN 사용자 간 격리 검사 |
| 11–12. Secret non-reflection / log redaction | 부분 확인 | 최신 버전의 응답·헤더·로그 필드에서 비밀/식별자 비노출 확인 |
| 13. Metrics / alerting | 미수용 | 최신 버전과 DB/Auth/Saju dependency golden signals, 실제 경보 발생·전달·보존 근거 |
| 14. Rollback candidate | 부분 확인 | 정확한 직전 artifact·source·호환성 확인 및 기존 안전 절차에 따른 rollback/recovery 증거 |

추가 규칙:

- [#42271216975](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271216975)는 익명 운영 ingress 증거로만 사용한다. 같은 main의 [Supabase Production #42271105691](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42271105691)은 `deploy-migrations`가 SKIPPED였으므로 migration 배포 성공으로 간주하지 않는다.
- `inspect-main-operations-acceptance.mjs`는 exact-SHA 증거 수집기이며 `acceptanceDecision=NOT_EVALUATED_BY_COLLECTOR`를 반환한다. 수집기 성공을 14개 항목 자동 PASS로 해석하지 않는다.
- Positive Production smoke에 기존 수동 확인 문자열 또는 승인 절차가 요구되면 임의 dispatch하지 않는다. 사용자 데이터·실결제·실제 Reader/Chat 부작용은 만들지 않고 전용 합성 주체만 사용한다.
- 배포가 바뀌면 그 이전 버전의 live E2E·로그·메트릭·rollback 증거를 최신 버전 수용으로 승격하지 않는다.

**Phase 13 종료 조건:** §33의 14개 항목이 모두 증거 기반 PASS이고, §34 적용 가능한 장애 행렬 및 §35 Runbook이 확인되며, Phase 8 재개 게이트가 열린 상태여야 한다.

## 4. 최종 종료 판정

다음 조건을 모두 충족할 때만 전체 Production Operations를 완료 처리한다.

1. Phase 8 종료 조건 전부 충족, #1887 해결 및 종료 근거 기록.
2. Phase 11 주요 제품 의존성 실패·복구 실측 완료. 이미 성공한 overlap 실험은 재사용하고 미측정 조합만 보완.
3. Phase 12 수동 확장·축소 판단 기준과 근거가 승인됨. 자동 확장은 별도 목표가 아님.
4. Phase 13 §33 14개 항목 PASS, §34 장애 행렬 및 §35 Runbook 종료 조건 충족.
5. 최신 main SHA와 실제 배포 Worker/Saju artifact가 일치하고, 버전별 수용 증거가 유효함.
6. `dr_ready=true`, `serviceResumptionAllowed=true`. Phase 11 비운영 용량 실측과 Phase 12 수동 확장 판단 기준이 각각 증거와 승인 범위 안에서 완료됨. 실제 Production 계측·승인이 없다면 `productionCapacityProven=false`는 그대로 유지하며 격리 수치를 Production 용량으로 승격하지 않는다.
7. 미해결 차단·승인 대기·증거 만료가 없음.

위 조건을 충족하기 전에는 `ROADMAP_COMPLETE`를 선언하지 않는다. 문서 병합, CI GREEN, 백업 성공, 격리 복원 성공 또는 익명 E2E PASS 하나만으로 전체 종료를 선언하지 않는다.

## 5. 승인·안전 경계

| 작업 | 진행 조건 |
|---|---|
| Read-only migration/source/ACL 조사 | 기존 권한 범위에서 독립적으로 진행 가능 |
| 비운영 격리 부하·복구 실험 | 합성 데이터·루프백/격리 대상·기존 워크플로만 사용 |
| Production privacy canary | 정확한 사용자 승인 `RUN_SYNTHETIC_PRODUCTION_PRIVACY_CANARY` 필요 |
| Production migration repair/deploy 또는 DDL/DML | 원인·영향·forward-only 계획을 먼저 제시하고 사용자 명시 승인 필요 |
| 신규 Hosted DR project / 유료 리소스 | 대상·비용·부작용을 보고하고 사용자 승인 후 생성 |
| Production traffic, secret, IAM, provider configuration 변경 | 별도 명시 승인 없이는 실행하지 않음 |

기존 Production 프로젝트를 테스트 DR 대상으로 전환하지 않는다. 실제 사용자 데이터·토큰·객체 내용을 로그나 산출물에 남기지 않는다. 외부 업체 문의나 로드맵 밖의 기능 추가는 하지 않는다.

## 6. 기존 기준 문서

- [Production Operations architecture](../architecture/PRODUCTION_OPERATIONS_ARCHITECTURE_V1.md) — 운영 계약·14개 수용 항목·장애 행렬·Runbook·Phase 정의의 권위 문서.
- [Production Operations status/worklog](PRODUCTION_OPERATIONS_STATUS_AND_EXIT_20261030.md) — 날짜별 실측 및 현재 상태 기록.
- [PostgreSQL DR readiness](POSTGRES_DR_READINESS_STATUS_V1.md), [Hosted Auth/Storage gap matrix](HOSTED_AUTH_STORAGE_DR_GAP_MATRIX_V1.md), [Privacy ledger authority](POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md), [Privacy replay](POSTGRES_PRIVACY_RECONCILIATION_REPLAY_V1.md) — Phase 8 상세 권한·복구 경계.
- [Phase 11 capacity evidence](API_CONTROLLED_CAPACITY_PHASE11_20261030.md), [Phase 12 scaling review](OBSERVED_SCALING_REVIEW_PHASE12_20261030.md), [Phase 13 acceptance evidence](MAIN_OPERATIONS_ACCEPTANCE_PHASE13_20261030.md) — 이미 확보한 실측과 잔여 검증 근거.

Watchtower-Track: ops
### 2026-11-08 / Gate 1 Phase 8-C — scheduled privacy ledger predecessor attempt repair

- Exact RED [#42404193088](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42404193088) attempt 1 on `3bdec3c162b132284498ebed38e15feaf32c0ff9` was a main scheduled Production PostgreSQL Privacy Recovery Ledger run. The predecessor resolver rejected **two unexpired artifacts in the same previously successful re-run ID**, not a failed DB query or missing encryption secret.
- Observed predecessor [#42381192945](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42381192945) attempt 2 has the valid latest upload artifact `13582736761` created at 2026-11-07T17:00:59Z and earlier attempt 1 artifact `13577209175` at 14:21:35Z. The source must match the **last successful attempt's exact upload step window**, and still fail closed if that step has missing/expired/ambiguous evidence.
- This correction changes only selection/read-only metadata behavior. New PR exact-SHA CI and a fresh successful **main run using merged workflow code** are required before declaring scheduled RED closed. Re-running #42404193088 without a source change uses the old SHA and does not verify the fix. Independent continuity, RPO, Hosted DR and service resumption remain unproven; #1887 stays open.
