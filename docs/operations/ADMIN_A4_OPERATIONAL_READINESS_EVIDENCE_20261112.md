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
