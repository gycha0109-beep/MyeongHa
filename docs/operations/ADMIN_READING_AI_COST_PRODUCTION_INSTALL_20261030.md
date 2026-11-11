# Reading AI 비용 비공개 원장 설치 — 2026-10-30

기존 A4 비용 원장·Writer RPC·개별/월간 조회 RPC를 Production에 설치했습니다. Saju 호출 결속이나 실제 비용 수집을 활성화한 것은 아닙니다.

- Project: `cnsfpcdiyofqvhpcegfc`
- 실제 migration: `20261030015858_admin_console_reading_ai_cost_foundation_v1_20261030`
- 적용 파일: `apps/admin/database/production-reading-ai-cost-foundation-manual-v1.sql`
- 기존 후보: `reading-ai-call-cost-offline-v1.sql`. 설치를 재실행하지 않습니다.

## 실제 수정과 설치

실제 PostgreSQL 실행에서 `RETURNS TABLE(call_id ...)`의 출력 변수와 `ON CONFLICT(call_id)`가 충돌해 INSERT가 실패했습니다. 충돌 대상을 기본키 제약 `reading_ai_call_cost_events_v1_pkey`로 명시해 수정했습니다. Production 함수 3개의 본문은 이 수정을 반영한 기존 후보와 동일합니다.

비로그인 최소 권한 Source와 별도 로그인 Writer를 분리했습니다. Source에는 실행 시도의 ID/Reading/Subject/시작 시각 4개 컬럼 조회와 자체 비용 원장만 허용합니다. Writer는 기록 RPC만 실행하고 비용 테이블 직접 읽기/쓰기·고객 테이블 변경은 허용하지 않습니다. Reader에는 제한된 조회 RPC만 부여하며 기존 public/운영 허용 컬럼은 178개 그대로입니다. 새 역할의 로그인 비밀은 없습니다.

관리형 비슈퍼유저 계정에서 필요한 소유권 이전은 트랜잭션 안의 임시 SET/CREATE로 처리하고 제거했습니다. 일반 사용자 역할·기존 Worker·Reading 실행 상태·도메인 불변식은 변경하지 않았습니다.

## 검증과 남은 결속

- 폐기형 PG17.6의 실제 DB에서 기록·동일 호출 재실행·사용량 미확인 실패 호출·월 집계·Writer 직접 조회 거부 통과. 합성 시나리오의 알려진 추정액과 미측정 호출은 분리됐으며 모두 롤백했습니다.
- Production에서 실제 RPC가 존재하지 않는 실행 시도 결속을 거부하고 Writer 직접 SELECT도 차단함을 롤백 검증했습니다. Reader 월간 RPC 실행과 설치 후 카탈로그를 확인했습니다. 비용 원장은 0행이고 고객 Reading/실행 시도에는 합성 데이터를 넣지 않았습니다.
- 공급사 호출 전체 관측·명하/Saju 요청 매핑·청구/환율은 미검증입니다. 기존 월간 응답의 `coverage=provider_events_only_unverified`, 전체 추정/확정/KRW 비용 null을 유지합니다. 원장 행 수를 실제 Reading 생성 0건·비용 0원으로 해석하지 않습니다.
- Supabase advisor의 `rls_enabled_no_policy` INFO가 이 전용 원장에 있습니다. 기존 계약은 RLS로 일반 역할을 기본 차단하고, 비로그인 테이블 소유자의 제한된 SECURITY DEFINER RPC로만 접근합니다. Writer/Reader의 직접 테이블 권한은 없습니다. [해당 advisor 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

`SajuReadingProviderBindingAuthorityV1.resolve()`에 필요한 실제 요청 → DB Reading/실행 시도 매핑 정본은 여전히 없습니다. 이 설치로 Production Interpretation HOLD를 해제하거나 식별자 동등성을 가정하지 않습니다. 안전한 전용 Writer 자격증명과 권위 있는 호출 전달 결속이 남았습니다.

## 2026-11-09 — A4 DB 실행 참조 검증 어댑터 (오프라인 후속 구현)

- `apps/api/src/reading-ai-saju-attempt-db-verifier-v1.ts`는 Source Authority가 독립적으로 증명한 정확한 `executionAttemptId` + `externalRequestRef`를 받아, PostgreSQL의 **종료 상태** 실행 시도와 일치하고 해당 참조가 **DB 전체에서 1건뿐일 때에만** 정본 Subject/Reading/시도 UUID를 돌려주는 별도 읽기 전용 어댑터입니다. 실측 사용량이나 Saju 내부 요청 ID를 DB 참조와 같다고 가정하지 않습니다.
- 전용 읽기 역할 `myeongha_reading_ai_cost_binding_reader_v1`은 **운영에 존재한다고 주장하지 않으며 생성·설치하지 않았습니다.** 향후 승인된 DB 권한 설계는 전송 참조와 시도 식별자에 대한 최소 SELECT, 중복 참조 판별에 필요한 **전역 RLS 가시성**, 기존 비용 Writer와의 권한 분리를 충족해야 합니다. 그런 역할이 없는 운영 환경에서 어댑터는 호출되지 않습니다.
- 실행 시작 시점에는 `external_request_ref`가 저장돼 있지 않으므로 이 어댑터는 **종료 이후 사후 대조 전용**입니다. 실제 실패/미완료 호출을 모두 다루는 발급 쪽 영수증 및 보류 이벤트 추적·재처리 구현은 여전히 선행 조건이며, 현재 비용 원장의 0건은 0원 또는 완전한 관측 증거가 아닙니다.
- 별도 서버 권한·접속 비밀·HTTP 라우트·배포 바인딩·DB 스키마/권한/실데이터 변경 없음. 자체 단위 테스트 4건 및 변경 파일 strict TypeScript 검사 통과. `ROADMAP_COMPLETE` 선언 불가.

## 2026-11-09 — A4 결속 전용 DB 읽기 역할 오프라인 설치 후보 (운영 미적용)

- 설치 후보: `apps/admin/database/reading-ai-cost-binding-reader-offline-v1.sql`. 기존 `reading-ai-saju-attempt-db-verifier-v1.ts`가 요구하는 **별도 읽기 전용 역할**을 위한 버전 고정 PostgreSQL SQL. 현재 운영 DB에는 해당 역할이 없음을 SELECT-only 확인했고, 본 후보를 운영에서 실행하지 않았다.
- 사전 조건: 관리형 `postgres` 설치자, RLS 활성화된 기존 `public.reading_execution_attempts`, 설치된 A4 Cost Writer 역할, 미설치 역할/정책, 전역 유일성 판별을 흐리게 하는 제한적 RLS 정책 없음. 위반 시 설치 거부; 재실행도 거부.
- 최소권한: `id`, `reading_id`, `subject_id`, `external_request_ref`, `state` 열에 대한 SELECT와 명시적 조회 정책만 허용. 전역 동일 요청 참조 카운트를 위해 제한 없는 SELECT 가시성을 요구. 수정을 위한 권한·테이블 전체 SELECT·스키마 CREATE·멤버십·BYPASSRLS 없음. `LOGIN`이지만 비밀번호는 **NULL**이며 별도 Owner 승인 없이는 운영 연결 불가. 실제 보안 자격증명, Cloudflare 바인딩, 사용자/결제 원장은 건드리지 않음.
- **독립 검증:** Docker `postgres:17.11`의 새 임시 DB에 최소 Reading 시도 테이블과 RLS, 기존 비용 Writer 역할만 생성한 다음 후보 SQL을 실행해 BEGIN→preflight→ROLE→GRANT→POLICY→postflight→COMMIT 성공. 임의 데이터로 동일 external ref 2행과 유일 ref 1행이 조회되고, 허용하지 않은 `started_at` 읽기 및 UPDATE가 각각 PostgreSQL 권한 거부되는 것 확인. 역할에 비밀번호·멤버십이 없는 것 확인. 임시 Docker DB는 작업 종료 즉시 중지·삭제. 실제 운영 데이터·테이블에 합성 기록 삽입하지 않음.
- **운영 수용 HOLD:** 본 테스트는 Production 적용·실제 Saju 요청 매핑·실제 연결 성공의 근거가 아니다. 실제 Production Reader 역할/비밀번호/전송 경로/Source 권위의 요청→시도 매핑과 사용량 보존/실패 재처리/청구 대조는 별도 승인·검증 전까지 미활성. `ROADMAP_COMPLETE` 미충족.

## 2026-11-09 — Owner 승인 후 Production RLS 상태 사전 점검 및 별도 설치 후보

- Owner가 A4 전용 읽기 계정 설치, 실제 호출-Reading 실행 결속 구현, 필수 CI/검증 통과 후 비용 수집 활성화를 승인함. 기존 회원·결제·크레딧 데이터 변경은 금지.
- 운영 DB SELECT-only 확인: `public.reading_execution_attempts.relrowsecurity=false`, `relforcerowsecurity=false`, 기존 A4 Writer 존재, A4 binding reader 부재, `external_request_ref` 비NULL 0행. 앞선 `reading-ai-cost-binding-reader-offline-v1.sql`은 RLS=true를 요구하므로 운영에 적용하지 않음.
- 실제 운영 상태에 맞춘 **별도** `apps/admin/database/reading-ai-cost-binding-reader-rls-off-v1.sql` 후보를 작성. 기존 테이블 RLS 모드를 변경하지 않고, 독립 비상속·비밀번호 없는 계정에 5개 열 SELECT만 부여하며 정책은 생성하지 않음. 기존 A4 Reader/Writer의 권한은 변경하지 않음. 비밀키·연결 바인딩·실수집은 아직 없음.
- 임시 Docker PostgreSQL 17.11에서 RLS-off 테이블, 기존 Writer 역할을 구성해 신규 후보 설치/읽기 성공을 확인하고 컨테이너 삭제. **운영 DB 설치는 CI 및 별도 적용 검증 전까지 미실행**. 실제 Saju 호출에서 DB 시도로 이어지는 Source Authority 증명과 공급사 비용 대조는 여전히 미완료.

## 2026-11-09 — A4 전용 Reader 설치 재검증: Supabase 관리형 자동 역할 멤버십

- [PR #3172](https://github.com/gycha0109-beep/MyeongHa/pull/3172)는 필수 Integration CI SUCCESS 후 병합됨. Owner 승인에 따라 Production에 SQL을 적용했으나 postflight가 두 차례 트랜잭션 롤백됨. 역할·정책 미생성을 Production SELECT-only로 재확인했으며 고객 데이터·기존 RLS·비용 수집 변경 없음.
- 근거: PostgreSQL 관리형 `postgres`가 새 역할을 생성하면 `supabase_admin`이 grantor인 `postgres`의 **ADMIN-only** membership이 자동 부여됨. `inherit_option=false`, `set_option=false`, `admin_option=true`. 기존 A4 `myeongha_reading_ai_cost_source_v1` 및 `myeongha_reading_ai_cost_writer_v1`에도 동일한 membership. 설치자 자신을 grantor로 지정한 REVOKE로는 이를 제거할 수 없음.
- 변경: 전용 Reader의 멤버십 검사에서 **오직** `role=new Reader, member=postgres, grantor=supabase_admin, inherit=false, set=false, admin=true` 조합만 허용. 그 외 멤버십·SET/INHERIT 활성은 거부. 테이블 전체 SELECT/쓰기·스키마 CREATE·5개 외 컬럼 접근 거부 및 RLS 기존 상태 유지.
- 검증: 임시 Docker PostgreSQL 17.11을 `supabase_admin` 슈퍼유저 + 비슈퍼 `postgres` DB 소유자/CREATEROLE로 구성. 동일 관리형 자동 grant가 생성되는 환경에서 후보 SQL의 pre/postflight 및 COMMIT 성공. `postgres`의 전용 Reader SET ROLE은 PostgreSQL이 거부함. 이 검증은 Production 설치·인증 자격 증명·Saju 실호출 연계를 의미하지 않음.
- **운영 적용 대기:** 수정 PR 일반/통합 CI 통과 및 병합 확인 뒤에만 재설치. 실제 Saju provider call과 DB attempt 결속, 별도 안전한 접속 비밀 및 사용량 커버리지 검증 전 비용 수집은 비활성/HOLD.

## 2026-11-09 — A4 비용 결속 Reader 운영 설치 완료 (Owner 승인)

- Owner 승인: A4 운영 DB 전용 읽기 계정 설치 및 사주 호출·Reading 실행 결속 구현. 비용 수집은 필수 CI/실제 출처 검증 후 활성화. 고객·결제·크레딧 변경 금지.
- 병합/필수 Integration SUCCESS: [PR #3176](https://github.com/gycha0109-beep/MyeongHa/pull/3176), merge `273764b70714492c9fa5ab5fdb1800c4645711ff`, [Integration #42576488537](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42576488537).
- 운영 Supabase project `cnsfpcdiyofqvhpcegfc`에 `admin_a4_reading_ai_cost_binding_reader_rls_off_managed_v1_20261109` SQL migration **성공**. 적용된 정본: `apps/admin/database/reading-ai-cost-binding-reader-rls-off-v1.sql` (해시 Git Blob `c1869f9101f5557939051e046ece6fadb5554264`).
- 읽기 역할 `myeongha_reading_ai_cost_binding_reader_v1` 생성 확인: LOGIN, NOINHERIT, NOSUPERUSER, NOBYPASSRLS. 필요한 `id/reading_id/subject_id/external_request_ref/state` 5개 열 SELECT만 허용. `started_at` SELECT, INSERT/UPDATE, 스키마 CREATE 모두 거부. `postgres`의 SET ROLE/권한 상속 불허, `supabase_admin` 부여의 ADMIN-only·SET=false·INHERIT=false 멤버십 1건 확인.
- 운영 원본 `public.reading_execution_attempts` RLS=false 유지, 새 Reader policy=0, `anon/authenticated` 직접 테이블 권한=0. 실제 비밀번호는 설정하지 않았고, 별도 서비스 접속/바인딩도 하지 않았음.
- **미완료/HOLD:** 인증된 Production Saju 출처에서 실발급 provider-call requestId/callId와 preallocated DB attempt/ref를 결속하고, source 증거를 보존·서명/검증하며 실제 비용 Writer까지 연결해야 함. 비용 수집 OFF, 전체 비용/KRW/청구 일치 주장 금지. Reader 역할 설치만으로 비용 원장이 활성화되거나 사용량이 채워지지 않음.

## 2026-11-09 — A4 실제 Saju Provider-call 출처 서명 검증 후보 (운영 미연결)

- `apps/api/src/reading-ai-saju-signed-call-source-v1.ts`: 실제 Saju 서버가 발급한 `saju-provider-call-source-proof-v1` HMAC 증명을 수신하여, 신뢰된 발급자/대상/키 ID/호출 ID/시각/모델/정확한 토큰/시도 UUID/`externalRequestRef`가 서명과 일치하는 경우에만 MyeongHa 비용 귀속 엔진의 `SajuProviderCallSourceAuthorityV1` 포트에 검증 결과 제공.
- 원본 호출 증명은 **출처 서버가 자체 불변 저장소에 보관하고** 비용 관리 서버가 서버 전용 조회 포트로 읽어야 함. 사용자·브라우저 자료를 출처 증명으로 승인하지 않음. 조회 실패·서명 불일치·미확인 연결 시 `null` 반환.
- 실제 과금 기록은 여전히 독립 DB 실행 시도 검증 `reading-ai-saju-attempt-db-verifier-v1.ts`의 일치 결과가 추가로 필요함. 현재 소스 증명 영속 저장소·연결 자격증명·운영 발급 경로·Writer 호출은 미구현. 비용 수집 OFF.
- 독립 테스트 4건과 대상 소스 strict TypeScript 검사 통과. 새로운 운영 DB/비밀번호/API/프로필/크레딧 변경 없음. `ROADMAP_COMPLETE` 미충족.

## 2026-11-10 — Saju Source 영수증 전용 DB Reader 로더 (오프라인, 운영 미연결)

- Saju [PR #2767](https://github.com/gycha0109-beep/Saju/pull/2767)은 필수 [통합 검증 #42740408956](https://github.com/gycha0109-beep/Saju/actions/runs/42740408956) 성공 후 병합됨. 후속 Saju 출처 소유 PostgreSQL 불변 영수증/전용 Reader 역할은 [PR #2768](https://github.com/gycha0109-beep/Saju/pull/2768)에 구현 후보로 제출되어 있으며, 본 단락 작성 당시 필수 CI·운영 설치 완료가 확인되지 않음.
- `apps/api/src/reading-ai-saju-source-receipt-db-reader-v1.ts`는 **별도 Saju 출처 DB** 전용 Reader 역할 `saju_a4_provider_receipt_reader_v1`만 허용하고, 호출 UUID에 대한 `BEGIN READ ONLY` + 변수 결속 `SELECT proof::text`만 수행한다. MyeongHa 기존 관리자 Reader, A4 실행 대조 Reader, Cost Writer/일반 API executor의 권한은 사용하지 않는다.
- 조회 결과는 크기·필드 allowlist·정확한 호출 ID를 확인한다. 행 부재·중복·변조·원문 추가·DB 장애는 출처 증명을 생성하지 않으며, 반환한 자료도 기존 `createSajuSignedProviderCallSourceAuthorityV1`의 **독립 HMAC·토큰·호출 식별자 검증**이 필수다. 브라우저·관리자 UI·공개 API를 통해 증명을 등록/조회하지 않는다.
- `apps/api/src/reading-ai-saju-source-receipt-db-reader-v1.test.ts`: 정상 서명 검증기 결합, 잘못된 DB role 차단, 부적절한 UUID 거부, 누락/중복/변조/초과 길이 거부, DB 예외/롤백 처리 5개 신규 테스트. 기존 서명 검증 4개·DB Attempt 검증 4개와 총 13건 통과, 변경 파일 TypeScript 6 strict 검사 통과. 저장소 루트에는 ESLint 설정이 없어 별도 단독 ESLint 실행은 적용되지 않았으며 PR CI에서 프로젝트 지정 검사 확인이 필요.
- 이 파일은 출처 **조회 포트**만 구현한다. 운영 Saju 출처 DB 역할·연결 비밀번호·TLS 연결·서버 전용 인증 바인딩은 여전히 미연결. Saju 실제 발급 authority, 실행 시도 UUID·source ref 최종화, Source 영수증 사후 검증/중복 재처리, 공급사 전체 비용 정확성, 비용 Writer 연결/실수집은 HOLD. 기존 운영 DB 설치·로그인·서비스·고객/결제/크레딧 변경 없음. `ROADMAP_COMPLETE` 아님.

## 2026-11-10 — A4 출처 서명·정본 Reading 실행·비용 Writer 3중 검증 조합 (오프라인)

- Saju Source 전용 DB Reader, MyeongHa 정본 Reading attempt 전용 Reader, MyeongHa AI Cost 전용 Writer를 **서로 다른 서버 비공개 PostgreSQL 연결**로 묶는 `apps/api/src/reading-ai-saju-proven-cost-composition-v1.ts`를 추가. 세 개가 같은 연결 풀인 구성은 생성 단계에서 거절. 각 계정은 기존 어댑터에서 정확한 DB `current_user`를 별도 확인한다.
- 호출마다 기존 검증 순서: (1) 출처 소유 영구 영수증 조회 + HMAC 서명·요청 식별자·실제 사용량 정확히 확인 → (2) 종료된 DB 실행 시도의 `executionAttemptId`와 `externalRequestRef`가 전체 DB에서 유일한지 확인 → (3) 전용 Writer RPC 기록. 호출자나 Preview Reader ID를 명하 UUID로 단순 대입하지 않는다. 검증 실패·불명확·누락·계정 오류면 원장 기록하지 않는다.
- `apps/api/src/reading-ai-saju-proven-cost-composition-v1.test.ts`: 정상 순서·정확한 원장 투영·영수증 누락/변조·사용량 변경·정본 실행 누락/중복/불일치·전용 계정 오류·스토리지 장애·공유 풀 거부 7개 신규 테스트. 관련 기존 테스트 합계 16건과 파일 지정 TypeScript strict 검사 통과.
- 비용 Writer는 기존 RPC 경계 외에 직접 DB INSERT·UPDATE를 실행하지 않는다. 이 신규 조합은 **서버 내부 미설치 함수**이며 공개 라우트/회원/Reading/결제/크레딧 처리·운영 DB·역할·비밀키·Cloudflare 설정을 변경하지 않았다.
- Saju Source PostgreSQL Writer/Reader 설치, 실서비스에서 서버 간 인증된 DB attempt 발급·종료 ref 결속, 실제 OpenAI callback 설치와 비용 영수증 전달, 사주 전체 누락 호출 대조 및 공급사 청구·환율 근거는 여전히 HOLD. 서명과 정본 DB 일치만으로 완전한 비용 집계를 주장할 수 없으며 `ROADMAP_COMPLETE` 미충족.

## 2026-11-10 — A4 실행 종료 후 영수증 단건 재처리 연결 (오프라인)

- Saju Source [PR #2769](https://github.com/gycha0109-beep/Saju/pull/2769), [PR #2770](https://github.com/gycha0109-beep/Saju/pull/2770)은 해당 커밋의 필수 Integration SUCCESS 후 병합됨. #2770의 실제 OpenAI 콜백·서명 영수증·관측 누락 영구 기록은 **서버 내부 설치 후보**일 뿐 운영 발급/서비스 설치 완료가 아님.
- `apps/api/src/reading-ai-saju-postterminal-replay-v1.ts`: Saju Source 전용 DB Reader에서 **서버 선택 callId** 1건의 보존된 증거를 재조회하고, 바로 그 증거의 호출 관측값만 추출한다. 이어서 기존 `createSajuA4VerifiedCostCompositionV1`가 별도 Source Reader에서 HMAC 재검증 → 종료된 MyeongHa DB Reading 실행 시도·source ref 유일 결속 → 전용 Cost Writer RPC 기록을 차례로 확인한다. 재전달된 callId로 임의 사용량을 생성하지 않으며, 원장 RPC 멱등 `replayed` 결과를 보존한다.
- 영수증 부재/비정형은 명시적인 `held`와 `recordedCost:false`만 반환; 서명 위조·원본 사용량 변조·정본 DB 결속 불일치·권한/DB 장애는 비용 기록 없이 실패. 가격을 사용자 호출에서 임의로 전달하는 인수를 두지 않고, 단가 근거가 없으면 기존 원장 `price_unknown` 상태로 남긴다. 공급사 청구 정산은 항상 `invoiceReconciled:false`.
- 신규 테스트 7건 + 기존 3중 검증 테스트 7건 총 14건, TypeScript strict 및 Prettier 통과. 외부 OpenAI 요청·실제 운영 DB 접속·새 DB 권한·비밀번호·결제/크레딧/고객 변경 없음.
- **HOLD:** 실행 종료에 사용되는 실제 Saju 외부 ref 전달, 서버 간 Prepared Attempt Admission/Production Interpretation Authority, 출처 소유 영구 DB 운영 설치와 전용 비밀·TLS 바인딩, 실제 서비스 수집·공급사 청구 대조·누락 호출 완전성 확인은 미완료다. 이 단건 재처리 함수는 scheduler/HTTP/운영 Runtime에 설치하지 않았으며 코드를 병합해도 비용 수집 OFF다. `ROADMAP_COMPLETE` 아님.

## 2026-11-10 — 명하 사전 할당 Reading 실행 ID → Saju 전용 서버 요청 헤더 (오프라인)

- 사후 재처리 [PR #3192](https://github.com/gycha0109-beep/MyeongHa/pull/3192)는 정확한 HEAD `f1ee5d2c7bf7dc6f885f392ce70e0e93e4607259`에 대한 [Integration #42765388396](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42765388396) SUCCESS 후 병합됐다.
- `saju-production-reading-execution.ts`: 기존 실제 준비/동일 구매 확인용 `attemptPrepare.prepareBeforeSourceCall()`이 반환한 **true 이후에만** 동일 `executionAttemptId`를 `adapter.requestReading()`의 서버 전용 실행 인자로 전달한다. Preparing 이전에는 모델 호출·헤더 전송을 하지 않는다.
- `saju-production-reading-http-adapter.ts`: 요청 JSON(출생·사주 풀이)에는 메타데이터를 추가하지 않고 기존 Bearer 인증 요청에만 `x-myeongha-reading-execution-attempt-id`를 조건부 부여한다. 허용 가능한 UUID 형식만 허용하고 Preview 경로에서 해당 헤더는 거부하며, 일반 요청은 종전 동작 그대로다.
- 신규 테스트 4건 및 기존 공식 발급·HTTP 테스트 포함 총 55건, 엄격 TypeScript 검사·Prettier 통과. 이 헤더는 **식별 좌표일 뿐 Saju Source Authority 자체가 아니다**. Saju 서버가 Bearer 확인 + 준비된 DB 실행 시도에 대한 독립 일회성 검증을 수행하지 않으면 Source 증거 발급·비용 기록을 허용해서는 안 된다.
- Saju의 해당 헤더 수신/Source 서명 범위 설치, 인증된 Saju 외부 참조의 응답 전달 및 공식 실행 종료시 저장, 운영 전용 DB/Secret 연결, 실호출 커버리지·청구 검증은 HOLD. 이번 변경은 Production HTTP 서버·DB·비밀·실제 비용 수집을 활성화하지 않음. `ROADMAP_COMPLETE` 아님.

## 2026-11-10 — Saju 발급 외부 요청 참조의 HTTPS 수신·정본 Source 대조 (오프라인)

- 앞선 명하 [PR #3194](https://github.com/gycha0109-beep/MyeongHa/pull/3194)의 Prepared Attempt UUID 운송 계약을 계승하여, 실제 Saju 서버 [PR #2772](https://github.com/gycha0109-beep/Saju/pull/2772)가 명시적 Source admission 후 반환하도록 설계한 `x-myeongha-saju-external-request-ref` 헤더를 수신하는 전용 `requestReadingWithSourceRef()`를 추가한다.
- 이 서버 전용 메서드는 정확한 UUID 헤더·기존 HTTPS Bearer·ProductReadingResponse admission·Saju 발급 `saju_source_UUID` 형식 헤더를 동시에 요구한다. 헤더 부재/변형/Preview 경로는 출력 수락을 거부한다. source ref는 JSON Birth/풀이 응답에 삽입하지 않고 병렬 요청 각각의 비동기 결과에만 결속해 요청 간 혼합을 방지한다.
- `executeAndPersistCurrentBirthSajuOfficialReadingV1`에서 실제 HTTP 어댑터가 전용 수신 기능을 제공하면 그 결과의 정확한 외부 참조를 공식 발급 후단에 전달한다. `persistIssuedSajuOfficialReadingV1`는 원문을 읽기/DB 최종화하기 전에 **독립 Production Source verifier가 검증한 ref와 수신한 ref가 정확히 일치하는지** 확인한다. 불일치·형식 오류는 `production_source_unverified`로 보류하고 Mapping·Write를 금지한다.
- 신규 응답 운송 테스트 5건, Source/DB 최종화 거부 테스트 4건, 기존 공식 발급·HTTP 테스트 55건을 포함해 관련 **64건 PASS**, 엄격 TypeScript 검사 PASS. 기존 Mock 포트는 기존 독립 Production Source + DB Authority 조건을 그대로 요구하며, HTTP 전용 sourceRef 없음을 근거로 검증을 우회하지 못한다.
- **여전히 HOLD:** 운영 출처 영수증 스키마·전용 Secret/TLS/서비스 로그인, 실제 Production Interpretation Authority 사전 승인, 최종화 권한 및 Source 서명 검증, 실제 OpenAI 호출 커버리지·공급사 청구 대조가 필요하다. 단순 수신 헤더는 비용 증명/발급 권한이 아니며 실제 운영 배포·유료 API 호출·비용 수집은 실행하지 않았다. `ROADMAP_COMPLETE` 아님.

## 2026-11-11 — A4 명하 정본 DB 실행 준비 이후 서명 발급 후보 (오프라인)

- Saju [PR #2773](https://github.com/gycha0109-beep/Saju/pull/2773)의 원본 영수증·콜백 기록 교차 대조는 필수 Integration [#42938778847](https://github.com/gycha0109-beep/Saju/actions/runs/42938778847) SUCCESS 후 병합됐다. 이 검증은 관측된 호출의 저장 무결성만 확인하며 공급사 전체 비용 완전성 근거는 아니다.
- `apps/api/src/saju-a4-signed-prepared-attempt-issuer-v1.ts`: 이미 존재하는 `SajuOfficialAttemptPreparePortV1.prepareBeforeSourceCall`의 **정확한 사전 할당·현재 구매 검증 성공 이후에만** Saju 서버 전용 HMAC 증명 후보를 발급한다. 동일 실행 시도 replay/권한 거부·형식 오류는 null 반환, DB 오류는 즉시 상향 전달한다. 증명에 `executionAttemptId`, 정본 `readingId`, `subjectId`, 발급자·대상·키 ID·발급/만료 시각만 넣고 프롬프트/출생정보/고객 원문은 포함하지 않는다. 보통 만료 90초(최대 120초).
- Saju [PR #2774](https://github.com/gycha0109-beep/Saju/pull/2774)의 오프라인 HMAC/전용 Source DB Claim verifier와 버전 `myeongha-a4-prepared-attempt-proof-v1`, 도메인 `myeongha/a4/prepared-attempt-proof/v1`를 동결해 동일한 canonical sorted JSON으로 서명한다. Saju 측은 별도의 source DB PK로 한 시도 한 번만 사용할 수 있도록 한다.
- 신규 5건 + 기존 공식 발급·DB 시도 관련 테스트 34건 **총 39건 PASS**, 파일별 엄격 TypeScript/Prettier PASS. 발급자 자체는 **서버 내부 미설치 함수**이며, 이번 변경에서 DB 권한/비밀키/HTTP 헤더 전송/운영 Worker/유료 호출은 변경하지 않았다.
- **HOLD:** 실제 Production Interpretation Authority·정본 DB Prepare 호출자의 승인, 인증된 명하→Saju 서버 간 증명 조회/전달, 실서비스 전용 키·TLS·Source Claim DB 운영 설치·사용량/청구 완전성 대조가 필요하다. 이 증명은 Production Interpretation Authority나 사용자 Reading 공개 승인 자체가 아니며 비용 수집 OFF, `ROADMAP_COMPLETE` 아님.

## 2026-11-11 — DB 승인 서명 증명 보존·Saju 사설 HTTPS 조회 경계 (오프라인)

- `apps/api/src/saju-a4-prepared-proof-handoff-v1.ts`: 기존 DB 공식 Reading 준비 포트 대신 장착할 수 있는 **서버 내부 조합**. 정본 DB 신규 실행·현재 구매 검증 후 HMAC 서명 발급이 완료되고, 전용 PostgreSQL Writer의 보존/재조회/COMMIT까지 확인됐을 때만 `true`를 반환해 Saju 호출을 허용한다. 재시도/거절/보존 실패는 금지하거나 오류 상향 전파. 공개 ProductReadingResponse·비용 원장/결제/크레딧 동작을 변경하지 않는다.
- `apps/api/src/saju-a4-prepared-proof-postgres-v1.ts` 및 `docs/operations/ADMIN_A4_PREPARED_PROOF_PRIVATE_STORE_OFFLINE_V1.sql`: DB 출처 증명 전용 Writer/Reader 역할과 불변 증명 테이블 **운영 미설치 후보**. UUID당 최초 저장, 재조회로 동일 서명 검증, 다르면 거부, Writer와 Reader 역할 분리, RLS·UPDATE/DELETE 트리거·PUBLIC 권한 거부·비밀번호 미설치. 별도 전용 Reader는 읽기 전용 트랜잭션만 사용. SQL은 폐기형 PostgreSQL 17.11에 설치 확인 후 즉시 제거했다.
- `apps/api/src/saju-a4-prepared-proof-private-http-v1.ts`: **기존 API/관리자/Preview와 분리된 미설치 Server Factory**, 전용 Bearer 검증 후에만 UUID로 영구 저장된 증명을 사설 조회. GET 외 메서드, Cookie/Origin, 쿼리·임의 경로, 만료·식별 불일치 증명 거부. 전용 HTTPS/mTLS termination은 서비스 운영 시 필수이며 해당 네트워크/서버는 설치하지 않았다.
- 신규 HTTP 7건·DB 6건·정본발급 조합 4건 + 기존 HMAC 발급 5건 = **22건 PASS**, 엄격 TypeScript/Prettier PASS. Saju HTTPS 로더의 독립 테스트 7건도 PASS. 원본 출생자료·프롬프트·AI 원문·Secret은 저장하지 않는다.
- **HOLD**: 증명에는 회원/Reading UUID가 포함되므로 운영 보존 기간·파기/개인정보 정책 정합성 확인 전 전용 영구 테이블을 설치하지 않는다. 실제 운영 TLS·비밀 인증·계정·Producer/Consumer 동시 Runtime 주입, Production Interpretation Authority, 운영 실제 호출/청구 완전성은 미확정이며 수집 OFF. `ROADMAP_COMPLETE` 아님.
