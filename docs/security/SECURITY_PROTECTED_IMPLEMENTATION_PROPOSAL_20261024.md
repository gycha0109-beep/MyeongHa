# Security 남은 DB 구현 승인 범위

작성일: 2026-10-24 KST. 현재 브랜치: `codex/general-security-20261024`.

**승인 수신:** 사용자가 이 대화의 해당 질문에 “DB 구현·격리 검증 승인”으로 답했습니다. 아래 범위의 migration·adapter·서버 구성 연결 및 PostgreSQL 17.11 격리 검증을 완료했습니다. 최종 구현은 [로드맵](SECURITY_EXECUTION_ROADMAP_V1.md)과 [실행 근거](SAJU_ABUSE_ADMISSION_IMPLEMENTATION_EVIDENCE_20261024.json)를 따릅니다. 아래 목록은 승인 당시의 범위 기록이며 운영 정책 등록·활성화 승인이 아닙니다.

## 작성한 실행 코드

- `apps/api/src/saju-abuse-admission-http.ts`: 기존 HMAC client key 재사용, route별 admission port, 429/Retry-After, 장애·모순된 결과 503, 현재 credential 부재 시 401, 본문 취소. 같은 admission을 재시도하지 않습니다.
- 계산·Preview HTTP handler 및 각 Production 구성 함수: 신원 transport 검사 이후, Subject/Birth DB 조회·Preview 본문 읽기·외부 Saju 호출 이전에 gate를 실행합니다. 기존 관측 wrapper와 바깥 security emitter는 그대로 사용합니다.
- `config/security/vercel-production-4xx-error-anomaly-rule-candidate-v1.json`: 공식 provider schema v3의 `error_anomaly`, `statusGroup:4xx AND route:/api/*`, high severity, 기존 단일 project, team-owner 알림입니다. 401/403/429를 포함한 전체 API 4xx의 이상 징후이며 개별 status별 임계 경보는 아닙니다.
- 기존 `ensure-vercel-security-alert-rule.mjs`: 이 후보의 preflight/require/activate 실행을 지원합니다. 기존 5xx 정본과 다른 규칙은 별도 decision을 요구하며, 추가 규칙의 activate는 `policyAuthority=APPROVED` 및 `productionMutationAuthorized=true`가 없으면 provider 호출 전에 거부합니다.

최종 Production composition은 서버 전용 `sajuAbuseAdmissionEnabled` 입력이 true일 때 실제 PostgreSQL port를 만들며, 기본 호출은 관측만 유지합니다. 숫자는 DB 정책 결과에만 있으며 application에서 주입하지 않습니다. 현재 운영 mount에 해당 입력을 설정하거나 정책을 등록하지 않았습니다. 가짜 저장소·로컬 메모리 counter·새 공개 모드는 없습니다.

## 승인 요청 대상: 저장소 DB 코드 작성과 격리 실행

기존 #1526 계약과 `1310_member_auth_rate_limit_runtime_authority.sql` 패턴을 바탕으로 다음을 작성합니다.

1. 사주 전용 정책 registry와 UNLOGGED bucket을 갖는 신규 migration. 기존 Auth bucket과 합치지 않습니다. Counter key는 route + 승인된 policy version + canonical HMAC client key이며 원본 Member UUID·Guest hash를 counter에 저장하지 않습니다.
2. dedicated NOLOGIN owner의 security-definer admission 명령과 최소 실행권한. API executor는 counter·정책 표 직접 쓰기 불가, anon/authenticated/service_role 직접 호출·직접 표 접근 차단을 검증합니다.
3. 정책 registry의 승인값을 DB에서 읽습니다. window·limit·saturation·정리 보존이 없으면 fail closed입니다. 런타임 요청은 quota 숫자를 선택하거나 덮어쓸 수 없습니다. 이번 개발 승인만으로 실제 운영 수치를 seed하지 않습니다.
4. Guest의 기존 transport verifier는 opaque bearer의 HMAC을 만들 뿐 live-session 유효성은 Subject DB 조회에서 확인합니다. **임의 Guest 토큰으로 counter를 무제한 생성하지 않도록** admission 명령이 활성 Guest session을 확인한 후 bucket을 만듭니다. 유효 credential 부재는 counter를 만들지 않고 401로 끝납니다. 기존 API의 Subject/Birth 조회는 admission 이후입니다.
5. 승인 migration 명령에 대한 실제 PostgreSQL adapter와 두 Production composition의 서버 연결 코드. 미승인 정책·누락된 함수·DB 장애는 503이며 process-memory fallback이나 자동 재시도는 없습니다.
6. 일회용 격리 PostgreSQL에서 정상 Member/Guest, 두 route 독립, 동시 초과 차단, reset, saturation/cleanup, invalid Guest 무저장, executor/브라우저 역할 우회 차단, 오류 rollback을 직접 검사합니다. 데이터는 합성 fixture만 사용합니다.

migration 번호·실제 함수 signature·정책 registry 상세는 현재 저장소의 직접 의존 함수와 충돌 여부를 확인한 뒤 작성합니다. 이 문서가 미작성 SQL을 구현·검증 완료로 취급하지는 않습니다.

## 포함하지 않는 실행

후속 사용자 지시 **“공격 E2E까지 실행해보고 통과하면 병합하고 마무리”**로 필수 검사 후 PR 병합이 추가 승인됐습니다. 운영 DB 적용은 계속 제외됩니다. SQL은 기존 `supabase/proposals/`에 보관하여 main-push 자동 migration 적용을 방지합니다. 아래 문장은 최초 개발 승인 범위의 기록입니다.

운영 DB migration 적용, 운영 사용자 데이터 변경, 승인되지 않은 제한 수치 채택·활성화, main 변경·병합, Production 배포·traffic 전환, 4xx provider 규칙 활성화는 이 개발 승인에 포함하지 않습니다. 4xx 후보 decision은 현재 `NOT_APPROVED / productionMutationAuthorized=false`를 유지합니다.

## 종료 및 되돌리기

DB 코드와 실제 adapter·handler 경로를 작성하고 격리 검사 및 직접 타입/consumer 검사를 통과하면 개발 구현을 VERIFIED로 보고합니다. 현재 운영은 바뀌지 않습니다. 격리 DB만 폐기하며 운영 rollback은 실행하지 않습니다. 배포 후 정책 변경·제거·counter 정리 계약은 운영 적용 승인 패킷에서 별도로 확정합니다.

승인 근거 요구는 사용자가 이 대화에서 직접 제공한 AGENTS의 **“명시적 승인 없이 … DB schema·migration·RLS 변경 … 수행하지 않는다”**입니다. 일반 구현 전진 지시는 애플리케이션 gate 작성에 적용했고, DB migration 작성·실행의 명시적 승인은 별도로 확인합니다.
