# Cloudflare 전용 DB 자격증명 복구 — 2026-10-26

Watchtower-Track: ops

## 실제 결과

- 승인된 `myeongha_cf_api_login`의 비밀번호만 한 번 재설정했다. 무작위 48바이트 자격증명과 SCRAM-SHA-256을 사용했다.
- 변경 전 로컬 RSA 3072비트 키의 OAEP 암복호화·개인키 소유 증명을 검증했다. 암호화 복구 파일을 독점 생성·fsync·재읽기 후 개인키로 복호화하여 원본과 일치함을 확인했다. 개인키와 복구 파일은 접근 권한을 제한한 로컬 폴더에만 보관했다.
- Supabase 연결 도구의 승인된 명하 프로젝트에서 역할 상태 충돌을 확인한 뒤 단일 트랜잭션으로 비밀번호만 변경했다. 다른 로그인, 권한, 사용자 데이터, DB 객체를 변경하는 명령은 실행하지 않았다. 전체 운영 데이터가 동시 변경되지 않았다는 별도 스냅샷 비교는 하지 않았다.
- 실제 PostgreSQL 로그인: Supavisor 5432·6543 모두 성공. 최초 5432 검사는 28P01이었으나 비밀번호 추가 변경 없이 후속 검사에서 성공했다. 캐시 전파와 일치하는 현상이지만 정확한 내부 원인을 입증한 것은 아니다.
- 기존 승인 CA SHA-256 지문 일치, CA 유효기간, TLS 인증서·호스트 검증 및 `current_user=myeongha_cf_api_login`을 실제 확인했다. SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB=false, LOGIN=true, 연결 제한 5, 실행 역할 멤버십, 기존 유효기간 유지. 소유 relation/function/schema는 각각 0개다.
- 호스트는 현재 운영 Hyperdrive origin 및 Supabase 프로젝트의 Singapore 구성으로 재확인했다. 두 풀러 포트 모두 TLS·실제 비밀번호 인증을 검증했으며 전용 URL은 기존 거래 풀러 경로 6543을 사용했다.

## Cloudflare 상태

- 활성 버전: #115 `79c0a96c-adbc-4427-af10-1abb9006b3eb` — 변경 전후 100% 유지.
- 새 미배포 버전: #116 `2e9bab32-024d-4c74-81ae-93fee426dc3a`.
- `MYEONGHA_DATABASE_URL`, `MYEONGHA_DATABASE_PRINCIPAL`만 하나의 `wrangler versions secret bulk` 요청으로 반영했다.
- 버전 API 재조회: 두 secret_text 바인딩 존재, 나머지 39개 바인딩의 전체 메타데이터 동일, 전체 41개 유지, Worker 스크립트와 런타임 메타데이터 동일, 새 버전은 활성 배포에 포함되지 않음.
- 운영 readiness는 작업 시작부터 200이었다. userData/sajuCalculation=ready, sajuProductReading=blocked_by_authority, characterSajuSp2=disabled. 이 결과를 새 자격증명의 운영 수락이나 사주 전체 기능 수락으로 해석하지 않는다.
- 운영 Worker 배포, DNS 변경, Vercel 종료, Hyperdrive origin 변경, PR 병합은 수행하지 않았다.

## 복구 절차 보완

기존 실패 실행은 DB 변경 후 로그인 검증에서 실패했고 artifact 업로드가 건너뛰어졌다. 이후 main의 always() 업로드도 runner 소실 이전의 전달 보장을 제공하지는 못했다.

새 절차는 수신 공개키와 로컬 개인키의 소유 증명을 검증하고, 암호화 파일 저장과 원격 artifact 업로드 완료·artifact ID 확인·체크포인트 저장을 모두 마쳐야 ALTER ROLE을 호출한다. 업로드 실패나 체크포인트 실패는 변경 전에 중단한다. 불확실한 변경은 자동 재시도하지 않는다. psql 오류는 인증/TLS/권한의 고정 분류만 출력한다.

GitHub production 환경의 main 전용 정책을 그대로 유지했다. 이번 실제 복구는 승인된 Supabase 연결과 로컬 복구 파일 경로를 사용했다. 수정된 원격 비밀번호 변경 작업은 main 병합 없이 실행하지 않았으며, feature 브랜치에서는 비밀값 없는 안전성 검사만 실행한다.

DB 두 바인딩의 스테이징은 관련 없는 API 키나 인증 비밀값을 읽지 않고도 검증하도록 범위를 줄였다. 전용 계정·프로젝트·대상 호스트/포트·CA·verify-full·역할 검증은 유지한다.

## 검증과 남은 범위

- 복구 체크포인트 실제 암호 연산/실패 경계 검사 5개, DB 관련 Vitest 16개 통과. 전체 TypeScript typecheck 통과.
- 생성된 실제 비밀번호와 실제 개인키 전체 바이트를 기준으로 저장소 파일 및 해당 날짜 Wrangler 로그를 검사했다. 노출 0건. DSN에는 생성된 비밀번호가 포함되므로 해당 DSN의 원문 기록도 이 검사로 함께 검출한다. 모든 외부 시스템의 모든 로그를 포렌식 감사한 것은 아니다.
- 승인 범위의 복구·실제 로그인·미배포 버전 생성은 완료. 미배포 버전의 운영 활성화와 positive Member/Saju E2E는 이번 승인 범위 밖의 다음 작업이다.
- 기존 PR: https://github.com/gycha0109-beep/MyeongHa/pull/2597

로드맵: A 현재 확인 █████ · B 전달 안전성 █████ · C DB 복구 █████ · D 미배포 반영 █████ · E 실검증 █████
