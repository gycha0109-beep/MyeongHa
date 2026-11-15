# 관리자 A4 운영 설치·실수집 준비 상태 — 2026-11-12 읽기 전용 점검

> **목적:** 승인된 관리자 A4 기존 로드맵 9.2–9.6에 따라 **코드 존재 / 오프라인 검증 / 실제 운영 설치**를 분리한다. 운영 배포 승인서나 개인정보 보존 정책 결정이 아니다. 명하·Saju의 고객·결제·크레딧에는 변경 없음.

## 1. 증거의 범위

- 확인 시각: 2026-11-12 (Asia/Seoul). 명하 공식 GitHub `main`의 코드 존재 여부는 아래 파일별로 확인. 다른 트랙의 새 커밋이 main을 이동시킬 수 있으므로 문서 작성 기준 커밋은 `34e92aaee22bccad553dfce52fd9abb2e9b3740c`이다.
- 명하 Supabase 운영 PostgreSQL에 **SELECT 문만 수행**, 테이블·함수·역할 및 권한을 확인했다. 운영 데이터·행 수·고객 정보·비밀키는 읽지 않았으며 DB 변경도 없다.
- 별도의 **Saju 운영 Source DB**, Saju 실제 Production 서비스의 비밀키·전용 네트워크/TLS·실제 OpenAI 공급사 청구서는 이 점검에서 접근·검증되지 않았다.
- 일반·통합 CI를 통과한 오프라인 소스가 있더라도 실서비스 활성화는 검증되지 않은 상태로 분류한다. 현재 명하 PR #3228은 운영 미설치 코드의 별도 통합 검증 단계이며 여기서 병합 완료로 기록하지 않는다.

## 2. 기존 A4 기능의 3단계 상태

**표기:** 코드 = GitHub main 소스 존재, 검증 = 기존 작업 기록·PR의 오프라인 검증 근거, 운영 = 운영 설치 및 실제 사용·인증 증거. 확인 불가능하면 **미확인**, 미설치로 관찰된 경우 **미설치**.

| 기존 기능 | 코드 | 오프라인 검증 | 운영 설치/실사용 |
|---|---|---|---|
| 명하 공식 Reading 실행 시도 사전 DB 승인·UUID 결속 | 있음 | 기존 발급·HTTP 테스트 기록 있음 | A4 Source 연계 실행은 미확인 |
| 명하 정본 DB 승인 후 HMAC 사전 증명 발급 | 있음 | 기존 발급 테스트 기록 있음 | 전용 증명 운영 저장소 미설치 |
| 명하 서명 증명 영구 보존·재조회 | 있음 | 폐기형 PostgreSQL·테스트 기록 있음 | **전용 스키마와 역할 없음** |
| 명하 사설 Bearer GET 증명 조회 서버 | 있음 | 전용 HTTP 테스트 기록 있음 | 별도 TLS·서비스 런타임 설치 미확인 |
| 명하 서버 전용 Reading 실행 헤더·Saju Source ref 수신 | 있음 | 기존 운송 테스트 기록 있음 | 실제 Source 연계·결속 미확인 |
| Saju HTTPS 사전 증명 조회·HMAC·일회성 Claim | 있음 | 기존 Source DB 폐기형 테스트 기록 있음 | Source Claim 운영 DB·인증 미확인 |
| Saju 공식 Production Host·실제 OpenAI 콜백 연결 | 있음 | 기존 격리형 테스트·PR 검증 있음 | A4 실제 콜백 활성화 미확인 |
| Saju 불변 서명 영수증·콜백 커버리지·정합성 감사 | 있음 | 기존 테스트·필수 통합 CI 기록 있음 | Source 운영 DB·실제 공급사 호출 전수 미확인 |
| Saju 공급사 요청 전 영수증 Writer 준비 검증 | 있음 | Saju #2779 통합 검증·병합 기록 있음 | 실제 Runtime 적용 미확인 |
| 명하 정본 종료 실행 조회·Source 증명 3중 검증 | 있음 | 기존 테스트·필수 CI 기록 있음 | A4 실수집 연결 미확인 |
| 명하 단건·다건 비용 원장 멱등 재처리 | 있음 | 기존 PR 및 테스트 기록 있음 | 실서비스 수집 연결 미확인 |
| 명하 3개 독립 DB 계정 최소 권한 사전 검사 | 있음 | 명하 #3222 통합 CI·병합 확인 | 실제 서비스 3개 동시 접속은 미확인 |
| 명하 AI 비용 전용 원장·Writer RPC | 있음 | 기존 설치 작업 기록 있음 | **DB 객체·전용 Writer 권한 존재**, 실제 A4 호출 연결 미확인 |
| Reading별·월간 원가와 추정/확정/환율 표시 | 기존 코드 있음 | Admin README에 분리된 조회 계약 있음 | 실제 공급사 청구 전수·확정 KRW 미검증 |

소스 참조: 명하 `apps/api/src/{saju-production-reading-execution,saju-a4-signed-prepared-attempt-issuer-v1,saju-a4-prepared-proof-handoff-v1,saju-a4-prepared-proof-postgres-v1,saju-a4-prepared-proof-private-http-v1,reading-ai-saju-principal-readiness-v1,reading-ai-saju-attempt-batch-replay-v1,reading-ai-saju-postterminal-replay-v1,reading-ai-cost-writer-v1,reading-ai-saju-proven-cost-composition-v1}.ts`; Saju `src/production/reading-ai-a4-{myeongha-proof-http-loader-v1,signed-attempt-admission-v1,authorized-product-host-composition-v1,private-provider-capture-v1,source-coverage-audit-v1,source-writer-preflight-v1}.ts`. 각 경로의 파일 존재를 2026-11-12 별도로 확인했다. 상세 변경·이전 필수 통합 CI는 `ADMIN_READING_AI_COST_PRODUCTION_INSTALL_20261030.md` 및 Saju `docs/ops/A4_ADMIN_PROVIDER_CALL_SOURCE_SIGNED_PROOF_20261109.md` 참조.

## 3. 명하 실제 운영 DB의 검증 결과

2026-11-12 **기존 Supabase 명하 프로젝트의 PostgreSQL 17.6에서 읽기 전용 SELECT 확인**:

| 확인 항목 | 실제 결과 |
|---|---|
| 정본 `public.reading_execution_attempts` | 존재 |
| `myeongha_admin_ops.reading_ai_call_cost_events_v1` | 존재 |
| `myeongha_admin_ops.cmd_record_reading_ai_call_v1(uuid,uuid,uuid,jsonb)` | 존재 |
| `myeongha_reading_ai_cost_binding_reader_v1` | 로그인 가능, BYPASSRLS 없음 |
| 해당 Reader의 정본 `subject_id` SELECT | 허용 |
| 해당 Reader의 정본 INSERT/UPDATE | 거부 |
| `myeongha_reading_ai_cost_writer_v1` | 로그인 가능, BYPASSRLS 없음 |
| 해당 Writer의 비용 기록 RPC EXECUTE | 허용 |
| 해당 Writer의 원장 테이블 직접 SELECT/INSERT/UPDATE/DELETE | 거부 |
| `myeongha_a4_source_ops` 증명 전용 스키마 | **없음** |
| `myeongha_a4_prepared_proof_reader_v1` | **없음** |
| `myeongha_a4_prepared_proof_writer_v1` | **없음** |

이는 실제 DB 객체 및 계정 **권한 존재의 증거**다. 운영 서비스의 TLS 연결, 실제 로그인 비밀키 주입, Runtime 3중 결속, 실서비스 AI 호출·청구 내역을 증명하지 않는다. 별도 Saju Source DB가 설치되지 않았다고 단정하지도 않는다.

## 4. 실제 호출 전수·비용 검증의 미충족 조건

- **관측된 콜백 ≠ 실제 HTTP 공급사 호출 전수.** Saju 로컬 콜백 커버리지 보고서와 서명 영수증 정합성만으로 프로세스 중단·관측 실패·공급사 청구 대상 호출 누락을 배제할 수 없다.
- 출처 서명과 정본 실행 UUID 결속 ≠ 공급사 청구서의 호출별 비용 검증. 단가 버전·공급사 실제 청구·환율 출처가 검증되지 않은 호출을 0원/확정 원가로 표시하지 않는다.
- 명하 사전 승인 증명에는 `subjectId`, `readingId`가 포함된다. 기존 삭제·보존 정본에 전용 증명의 보존기간·철회/삭제 경로가 명시적으로 확정되지 않아 **스키마/역할을 임의 설치하지 않는다**. 이 정책 결정은 Owner 소관이며 기존 180일 분석/365일 감사 기간을 증명에 임의 적용하지 않는다.
- 운영 TLS·Secret·서버 전용 Bearer·Production Interpretation Authority·Saju 전용 Claim/영수증 계정과 실호출 인스턴스 결속이 모두 증거로 확인될 때까지 A4 실제 수집/운영 스케줄러 연결은 보류한다.
- `completeCostCoverage=false`, `invoiceReconciled=false`. 원장에 행이 없음을 무료/0원으로 해석하지 않는다.

## 5. 완료 판단과 다음 작업

1. 명하 #3228의 **정확한 HEAD에 연결된 필수 통합 CI**를 확인하고 일반 검사 통과만으로 병합 성공을 추정하지 않는다.
2. 운영 전용 증명 보존·삭제 정책은 기존 개인정보 삭제 정본과 일치하는 Owner 결정을 받아야 한다. 그 전에는 실제 증명 저장소를 설치하지 않는다.
3. 승인된 인증·전용 DB/TLS·실제 Production Authority와 독립적인 공급사 호출 대조 근거가 마련되면 해당 범위만 실서비스에서 확인한다. 실제 비용 수집은 그때까지 OFF.
4. 모든 기존 A4 수용 조건의 **코드/오프라인 검증/운영 설치**가 실증되기 전에는 `ROADMAP_COMPLETE`을 선언하지 않는다.

이 문서는 승인된 로드맵의 설치·권한 상태를 증거로 분류한 기록이며 추가 기능·스키마·예산 정책을 제안하지 않는다.

## 2026-11-13 후속 검증 — Source 호출 전 기록과 미결 조회 병합 (GitHub 전용)

- **증거 시점/방법:** 명하 `main` `575e554fbecfb5ea6975f64e8729dca360646dc8`, Saju `main` `34ab034955b0d918af76f827ea15c28cb6e6fca0`의 GitHub PR·workflow 상태만 확인했다. 2026-11-12의 운영 DB SELECT 실측은 재수행하지 않았으며, 현재 운영 DB의 설치·접속·실제 호출 상태를 새로 확인했다고 주장하지 않는다.
- Saju [#2739](https://github.com/gycha0109-beep/Saju/pull/2739)와 명하 [#3228](https://github.com/gycha0109-beep/MyeongHa/pull/3228)은 모두 **병합**됐다. #3228의 정확한 HEAD `197e3e2443cc72f9d51b12cb8d1ac165dd08fa1f`에 대한 [필수 통합 검사](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43139967971)는 성공했다. 과거 문서의 두 PR에 대한 '열림/검증 대기' 표기는 당시 상태이며 현재 진행 차단 조건이 아니다.
- Saju의 출처 측 후속 구현은 모두 **필수 통합 검증 성공 후 병합**됐다: [#2781](https://github.com/gycha0109-beep/Saju/pull/2781) [통합 #43161252438](https://github.com/gycha0109-beep/Saju/actions/runs/43161252438) — 요청 전 영속 의도 Writer; [#2782](https://github.com/gycha0109-beep/Saju/pull/2782) [통합 #43167124651](https://github.com/gycha0109-beep/Saju/actions/runs/43167124651) — 정본 실행 시도/호출 ID·서명 영수증 결속; [#2783](https://github.com/gycha0109-beep/Saju/pull/2783) [통합 #43173668433](https://github.com/gycha0109-beep/Saju/actions/runs/43173668433) — 일회성 승인 소비 전 영수증·의도 저장소 권한 검사; [#2784](https://github.com/gycha0109-beep/Saju/pull/2784) [통합 #43179672493](https://github.com/gycha0109-beep/Saju/actions/runs/43179672493) — 500건 상한의 미결 의도/영수증 없는 항목 조회.
- **현재 오프라인 구현:** 요청 전 Source 의도 보존, 반환/실패 후 서명 영수증 대조, 사전 최소 권한 검사 및 영수증 누락 기록의 읽기 전용 조회. '기록된 요청 전 의도'는 HTTP 실제 송신·공급사 도달·청구 발생을 증명하지 않으며, 누락 영수증을 자동 재전송하지 않는다. 오프라인 소스의 병합은 실제 서비스 결속/실수집 수용 완료가 아니다.
- **여전히 미충족/Owner 판단 필요:** 명하 사전 승인 증명의 개인정보 보존·삭제/철회 정책, 운영 Source·명하 증명 전용 DB 설치 및 인증/TLS/서비스 계정, Saju Production Interpretation Authority와 실제 AI 요청 실행 인스턴스 결속, 명하 비용 Writer까지의 인증된 최종 Source 참조와 공급사 독립 청구/환율 대조. 해당 정본 운영 근거 없이 운영 설치·유료 호출·비용 수집/재호출을 시행하지 않는다.
- **판정:** 오프라인 A4 Source 기록·미결 조회 구현 PR은 병합 검증 완료. **운영 A4 수용은 HOLD.** `completeCostCoverage=false`, `invoiceReconciled=false`, 비용 수집 OFF, `ROADMAP_COMPLETE` 아님. 추가 기능/정책을 신규 승인된 작업으로 만들지 않는다.

## 2026-11-13 Owner 정책 확정 이후

- 사용자님이 A4 사전 승인 증명의 **최대 30×24시간 보존**과 계정 삭제 시 즉시 폐기, 전용 저장소/인증의 단계적 운영 적용을 승인했다. 상세 정책: [A4 증명 보존·삭제 결정](ADMIN_A4_PREPARED_PROOF_RETENTION_DECISION_20261113.md).
- 저장소 후보는 내용을 변경할 수 없는 구조를 유지하면서, 삭제 요청 시 즉시 폐기와 30일 만료 배치 삭제만 별도 허용하도록 개정한다. 만료 정리 실행 일정·운영 TLS/비밀키·실제 Saju 연결은 **별도 운영 증거 미확인**이므로 상시 비용 수집 OFF를 유지한다.
- 앞선 미승인 정책 표기는 이 날짜의 결정으로 대체된다. CI와 운영 설치, 실제 호출·공급사 청구/환율 대조가 끝났다는 뜻은 아니다.


## 2026-11-13 운영 DB 증명 저장소 및 29일 선제 폐기 실측

**증거 범위:** 명하 Supabase 프로젝트 `cnsfpcdiyofqvhpcegfc`의 PostgreSQL 17.6에 직접 질의. 해당 DB로 스키마 설치·선제 폐기 함수 패치를 수행했으며, 설치 SQL과 최종 패치 SQL은 병합된 GitHub `main` 내용과 동일하다. 2026-11-12의 '미설치' 표는 과거 스냅샷이며, 아래 실측으로 갱신된다.

- 명하 [#3272](https://github.com/gycha0109-beep/MyeongHa/pull/3272): 정확한 HEAD `e6c1869fdc345b5bca2db7fcdbb72596f78d59b9`의 필수 [통합 검사](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43364671474) 성공·병합을 확인하고 `ADMIN_A4_PREPARED_PROOF_PRIVATE_STORE_OFFLINE_V1.sql`을 운영 DB에 설치했다.
- 운영 스키마 `myeongha_a4_source_ops`, 불변 증명 테이블 `prepared_attempt_proofs_v1`, Reader/Writer/정리 역할 및 계정 삭제 즉시 증명 폐기 트리거의 실제 존재 확인. 테이블 RLS 활성화, 전용 정책 3개. `anon`, `authenticated`, `service_role`, `myeongha_runtime`의 스키마 사용·읽기·쓰기 권한 없음. Reader/Writer의 직접 UPDATE/DELETE 거부; 정리 역할은 전용 함수 실행만 허용된다.
- 보관 정책은 **최대 30×24시간**이며, 1분 간격 자동 정리의 지연 여유를 위해 29일 기준을 적용했다. 명하 [#3275](https://github.com/gycha0109-beep/MyeongHa/pull/3275)의 정확한 HEAD `3389ab99163abde5e964fc37939abe558b3554a8`에 대한 [통합 검사](https://github.com/gycha0109-beep/MyeongHa/actions/runs/43371510789) 성공·병합 후, `ADMIN_A4_PREPARED_PROOF_RETENTION_SAFETY_WINDOW_PRODUCTION_PATCH_20261113.sql`을 운영 DB에 적용했다. 적용된 실제 함수 본문에서 29일 조건 존재·기존 30일 조건 부재·최대 1,000건 처리·행 잠금/중복 작업 건너뛰기 확인.
- 자동 정리 `myeongha_a4_prepared_proofs_purge_v1`: **활성**, 1분마다 실행, DB 실행 역할 `postgres`. 2026-11-13 **06:23–06:25 UTC의 연속 3회 실행 성공**을 `cron.job_run_details`에서 확인했다. 정리 실행 역할 자체가 전용 maintenance 역할인 것은 아니므로, 전용 역할의 최소 권한과 정기 작업 실행 주체를 혼동하지 않는다.
- 실측 당시 준비 증명 **0건**. 따라서 실제 29일 도달 행의 운영 삭제·대량 적체 처리 성능은 실증되지 않았고, 코드와 격리형 검증 및 스케줄 실행 성공까지만 인정한다. 정리 중단이 1일 이상 지속되거나 1회 1,000건 적체가 누적되면 최대 30일을 초과할 가능성이 있으므로 무조건적인 보존 상한 준수 보장은 하지 않는다.
- 연결된 Supabase 프로젝트 목록과 접근 가능한 Neon 프로젝트 목록에 Saju 전용 Source PostgreSQL 운영 인스턴스는 확인되지 않았다. **그 인스턴스가 세상에 존재하지 않는다는 판정은 아니다.** Saju Source 원본 DB·계정/TLS·개인 서비스 Bearer/HMAC 비밀·Production Interpretation Authority와 실사용 인스턴스 결속은 **미검증**이다.
- 실서비스에서 발급/호출 또는 비용 원장 실수집은 활성화하지 않았다. `completeCostCoverage=false`, `invoiceReconciled=false`, 상시 비용 수집 OFF. Saju Source 운영 설치·네트워크/TLS 및 서비스 비밀 공급·인스턴스 결속과 실제 소규모 호출 비용 상한 확인·공급사 청구 대조가 다음 수용 조건이다. **운영 A4 전체 수용은 HOLD / `ROADMAP_COMPLETE` 아님.**


## 2026-11-14 A4 Docker Source / 명하 운영 DB / Cloudflare 연결 경계 재실측

> 기존 2026-11-12~13 점검 이후 Saju Docker 구축·로컬 연결 작업이 병합된 상태를 반영한다. 이번 작업의 운영 점검은 **읽기 전용**이며 실제 Reading 생성, 공급사 요청, DB 증명 INSERT/DELETE, 서비스 배포는 수행하지 않았다.

- **Saju 코드/검사:** Docker 설치·TLS·전용 3계정·Node 연결·로컬 Reader/Writer 권한 검증·공식 Host의 비실행 연결 경계가 [Saju #2785](https://github.com/gycha0109-beep/Saju/pull/2785)~[#2792](https://github.com/gycha0109-beep/Saju/pull/2792)에 걸쳐 구현됐다. 마지막 #2792는 정확한 HEAD `9122a8f71611734b6b53ee101a583aae85ea7389`의 [필수 Integration](https://github.com/gycha0109-beep/Saju/actions/runs/43569555599) 성공 후 `2bb797f0ca05775ccaaa36814c041ae4262ac872`로 병합됐다. 기존 11월 12일 문서의 '별도 Source DB 미검증'은 당시 시점의 표기이며, **집 PC 로컬** Docker Source DB와 Node 접속에 한해 후속 실증됐다.
- **집 PC 로컬 Source:** 기존 `saju-a4-source-pg17` 컨테이너가 `healthy`였으며 루프백 `127.0.0.1:55432`의 로컬 접속만 검증됐다. 이는 외부 Saju 운영 인스턴스의 사설 통신 경로·서버 신원·공인 TLS나 Production 해석 권한의 증거가 아니다. 운영 공개 포트·새 터널·새 인프라를 생성하지 않았다.
- **명하 운영 Supabase (`cnsfpcdiyofqvhpcegfc`):** 연결된 명하 계정에서 실제 PostgreSQL 17.6.1을 읽기 전용 조회했다. `myeongha_a4_source_ops.prepared_attempt_proofs_v1` 존재, RLS 활성, 정책 3개, `myeongha_a4_prepared_proof_reader_v1` 및 `myeongha_a4_prepared_proof_writer_v1` 역할 존재를 확인했다. 조회 시 증명 행은 **0건**이었다. 서비스가 실제 증명을 발급·보존·전달했다는 의미가 아니다.
- **명하 증명 정리:** `myeongha_a4_prepared_proofs_purge_v1` 스케줄이 매분 활성 상태였고, 최근 확인된 2026-11-14 **07:35~07:37 UTC** 실행 3회는 모두 `succeeded`였다. 증명 행 0건이므로 실제 29일 경과 행 삭제 성공이나 30일 상한 준수의 지속적인 실증으로 확대하지 않는다.
- **Cloudflare 실제 배포 설정:** 연결된 Cloudflare 계정의 기존 `myeongha` 및 `myeongha-admin` Worker 설정에서 결속 이름·유형만 읽었다(비밀값 미조회). 두 Worker에서 **A4 전용 증명 서비스·Source 연결을 식별하는 바인딩이 확인되지 않았다**. 이것만으로 외부에 별도 A4 서비스가 없다고 단정할 수는 없지만, 해당 Worker에 A4 운영 경로가 설치됐다고 주장할 증거도 없다. 기존 일반 Saju 서비스 Bearer/Hyperdrive를 A4 전용 신원으로 대체하지 않는다.
- **다음 운영 수용 경계 / HOLD:** 사전 승인 증명의 인증된 비공개 HTTPS 발급·조회 및 서비스 신원, 로컬 Docker Source와 **실제** Saju 실행 인스턴스의 사설 네트워크·TLS/키 공급, 정식 Production Interpretation Authority, Saju Source 불변 영수증·의도·Claim의 승인된 별도 보존/삭제 정책, 모델·비용 상한이 구체화된 제한적 실제 공급사 호출, 독립 청구 원본/가격/환율 대조와 명하 전용 Cost Writer 결속이 충족되지 않았다. 임의 외부 포트 개방·로컬 자체 서명 인증서의 운영 승격·합성 증명 삽입·운영 비용 적재를 금지한다.

**판정:** A4 로컬 인프라/권한/연결 코드까지는 병합·실증, **서비스 간 실제 운영 결속은 HOLD**. `completeCostCoverage=false`, `invoiceReconciled=false`, 비용 수집 OFF, `ROADMAP_COMPLETE` 미충족.
