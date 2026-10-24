# 일반 Security 운영 적용

Watchtower-Track: security

## 승인과 범위

사용자가 개발·공격 E2E·병합 완료 후 남은 항목(제한값·보존정책 확정, 운영 DB 적용, 실제 차단·4xx 경보 활성화, 플랫폼 권한 후속)을 설명받고 **“거까지 하고 마무리 해”**라고 지시했습니다. 이는 앞선 개발·격리 승인에 없었던 운영 단계의 추가 승인입니다. 수치 선정은 이 이행 지시로 위임받아 아래 초기 제품 상한을 선택합니다. 사용자가 특정 숫자를 직접 지정했다고 기록하지 않습니다.

운영 개인정보·결제·사주 해석 권한과 세연 AI 보안 트랙은 변경하지 않습니다. migration은 이번 네 개만 적용하며 기존 원격 전용 이력이나 다른 트랙의 SQL을 재생하지 않습니다.

## 정책

| 경로 | 신원별 window | 허용 | saturation | Retry-After 최대 | 만료 뒤 정리 대상 |
|---|---:|---:|---:|---:|---:|
| 계산 | 60초 | 60회 | 61 | 60초 | 3600초 |
| Preview | 60초 | 20회 | 21 | 60초 | 3600초 |

Member·Guest는 기존 canonical HMAC으로 각각 구분하며 두 경로의 bucket은 독립입니다. 최근 30분의 단일 운영 deployment 로그 조회에서도 사용 가능한 표본을 얻지 못했습니다. 이 수치는 organic p99 추정이나 합성 smoke에서 도출한 통계가 아니라, 위임받은 초기 제품 보호 상한입니다. 보통 한 번의 화면 요청은 경로당 한 실행이고 자동 재시도는 없으므로 재조회 여유를 두되 연속 upstream 실행은 제한합니다. DB 장애는 503, 초과는 429이며 원본 신원·IP·payload는 counter에 저장하지 않습니다.

`canary-20261024-v2`은 경로당 60초/2회로 한정한 검증 정책입니다. 공개 release switch가 꺼진 동안 트래픽을 받지 않는 Production 빌드만 사용합니다. 3번째 요청의 429를 실제로 확인한 뒤, `production-20261024-v2`의 60/20 정책을 원자 전환합니다. Canary 정책은 그때 비활성화합니다.

정리 명령은 승인 보존 시간이 지난 counter만 한 번에 최대 5000개 삭제합니다. 기존 요청당 최대8개 정리는 유지합니다. 별도 운영 정리 작업은 개인정보가 없는 counter만 처리하며 성공 실행 사이의 장애·지연까지 포함한 엄격한 삭제 시한을 주장하지 않습니다.

4xx는 기존 후보의 API 전체 native anomaly(`statusGroup:4xx AND route:/api/*`)를 사용합니다. 수치 임계값은 Vercel 모델 소유이며 401/403/429 개별 status detector로 표현하지 않습니다. 기존 5xx 규칙을 유지합니다.

## 적용 순서와 되돌리기

1. 실제 관리 역할에 맞춘 non-superuser PostgreSQL 17 fixture에서 운영 SQL·최소권한·정책 전환·정리 상한·공격 E2E 검사.
2. 운영 schema·빈 counter·정책 catalog 확인 후 이번 SQL만 적용. 운영 `postgres`는 SUPERUSER가 아니므로 정책 표의 SELECT/INSERT/UPDATE(enabled)만 명시적으로 허용하고 별도 owner 멤버십은 제거합니다.
3. 필수 exact-head CI와 통합 CI 후 merge. Release switch 기본은 false라 병합만으로 차단을 켜지 않습니다.
4. alias를 받지 않는 Production 빌드에서 서버 전용 `MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED=true`를 적용하고, 승인된 테스트 Member/신규 합성 Guest의 정상·초과·Retry-After를 검사.
5. 정책을 60/20으로 전환하고 운영 서버 Config를 true로 설정한 뒤 검증한 Production 빌드를 promote. 공개 경로 정상 요청·counter 증가·4xx rule ID/상태 재조회.

되돌리기는 검증한 이전 Production deployment로 rollback하고 서버 Config를 false로 복원합니다. 필요하면 정책의 enabled만 false로 원자 변경합니다. 기존 신원·Birth·사주 자료나 counter 표를 삭제하지 않습니다. 정책 내용은 불변이며 다른 수치가 필요하면 새 version을 등록합니다.

## 외부 플랫폼 후속

운영 catalog에서 `supabase_admin` 소유 public relation은 0, 점검한 표의 anon/authenticated SELECT는 false입니다. 내부 관리자 기본권한 row는 아직 존재하며 운영 postgres는 해당 역할의 member가 아닙니다. [공식 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)는 기존 프로젝트의 2026-10-30 전환과 postgres 직접 연결의 별도 경계를 설명하지만, supabase_admin 기본권한을 고객이 변경하는 지원 절차·rollback을 제공하지 않습니다. 따라서 #425를 임의 종료하거나 플랫폼 내부 역할을 승격하지 않습니다. 지원 경로가 확인되면 별도 범위로 처리합니다.

## 실행 상태

운영 적용 전 준비 중입니다. 현재 상태와 실행 근거는 PR 및 후속 evidence에 기록합니다. 새 gate는 서버 release switch가 true이고 DB 정책이 활성인 경우에만 동작합니다.

정책 승인 시각 정정: 최초 v1에 입력한 13:00 UTC 반올림 시각은 실제 승인 수신/적용 시각이 아니었습니다. v1을 비활성 이력으로 보존하고, DB clock의 실제 등록 시각을 가진 v2를 새로 등록했습니다. 불변 정책 내용의 UPDATE·삭제나 trigger 우회는 하지 않았습니다.
