# PR-04D3B2B-3A — Cost Governor 레거시 RPC 권한 감사 및 전환 선행 조건

Watchtower-Track: character-memory

## 판정: 권한 철회 미승인 / Production ENFORCE HOLD

### 확인된 현재 권한
- 단일 `myeongha_api_executor` 역할이 `cmd_start_seyeon_ai_call_v1`, `cmd_settle_seyeon_ai_call_v1`, `cmd_record_seyeon_ai_call_cost_v1`와 양쪽 Governed Start/Settle을 모두 EXECUTE 할 수 있다.
- 이 역할의 API 런타임 Runner는 `postgres-subject-execution.ts`에서 매 거래 `SET LOCAL ROLE myeongha_api_executor`로 결속된다.
- 내부 `seyeon_ai_start_internal_v1`, `seyeon_ai_settle_internal_v1`은 cost meter NOLOGIN owner만 접근하며 직접 API 실행 권한이 없다.
- Subject 원장/일별 Governor 예산 및 rate card의 직접 DML/정책 조회 권한은 API executor에 부여되지 않는다.
- 위 권한 구조에서는 일반 Subject 경로와 동일 DB 세션/역할에 GOVERNOR 외 레거시 RPC가 여전히 노출되어 있다. D3B2B-1 및 -2는 호출 경로의 혼선을 제거했지만 전체 DB 권한 분리를 완료한 것이 아니다.

### 이 PR의 검증
- `test/db/seyeon_ai_governor_role_cutover_preflight_v1.sql`은 7개 RPC의 정확한 함수 서명, SECURITY DEFINER owner, EXECUTE 매트릭스, 브라우저 principal 차단, NOLOGIN/NOBYPASSRLS/NOINHERIT, cost owner 회원 관계 부재, 원장 직접 DML 차단을 실제 PostgreSQL 함수 권한 카탈로그로 검증한다.
- `SET LOCAL ROLE myeongha_api_executor` 후 executor의 Legacy Start/Settle/Record 사용 가능성과 private helper 차단을 확인한다. 이는 레거시 권한이 **아직 존재한다는 위험을 고정하는 진단 테스트**이며, ENFORCE 보안 완료의 증거가 아니다.
- DB Authority Core에 등록. 운영 마이그레이션/배포/권한 변경/유료 추론 없음.

## D3B2B-3B / -3C 필수 전환 계약
1. 신규 `myeongha_seyeon_governed_executor`는 NOLOGIN/NOBYPASSRLS/NOINHERIT, Governed Start/Settle 및 최소 Subject 컨텍스트 함수만 EXECUTE한다. 레거시 Start/Settle/Record, 내부 helper 및 데이터 테이블은 모두 거부한다.
2. 단순히 `SET LOCAL ROLE`만 바꾸면 안 된다. 기존 공용 DB 자격이 새 역할과 기존 API executor 모두로 SET ROLE 가능하다면 권한 경계 분리로 간주하지 않는다. **운영 DB 접속 principal을 별도로 분리**해 governed-only principal은 공용 API executor의 MEMBER가 아니고, 레거시 역할로도 전환할 수 없음을 실제 별도 로그인 세션에서 증명한다.
3. 비용 Runner는 전용 governed DB Pool을 사용한다. 트랜잭션 시작부터 resolver/current Subject 결속·ASSERT까지 별도 credential/role로 처리하며, 모든 권한·인증 에러는 Provider 호출 이전 fail-closed 한다. 관리자 자격 DB Pool/임의 executionRole injection은 금지한다.
4. 서버 Chat 네 역할 및 Post-turn worker의 ENFORCE Provider는 오직 governed-only Runner로 Start/Settle을 수행한다. OFF는 기존 공용 Runner를 유지한다. ENFORCE 실패 시 OFF로 자동 전환 금지.
5. SQL 권한과 실제 접속 계정/role membership은 같은 배포 환경에서 테스트한다. `pg_has_role` 조회만으로 접속 계정 분리를 증명했다고 간주하지 않는다.

## D3B2B-3D 권한 철회 승인 전제
- 모든 유료 Provider/Worker 인스턴스의 호출 경로 inventory, 기존 OFF 레거시 in-flight 및 미정산 거래의 처리/격리, 이전 서버 세대 배수, 운영 전용 접속 자격 발급·취소 및 롤백 Runbook
- 별도 독립 PostgreSQL Session에서 governed-only credential의 legacy RPC 및 `SET ROLE myeongha_api_executor` 거부 + governed RPC 성공
- 실제 production 안전 배포의 비용 원장-일별 예산 consistency, 중복/에러/타 Subject 부정 테스트, 정확한 HEAD 전체 CI/Integration, Security G4 Owner 검토
- **유료 AI 호출/운영 예산 시딩/Production ENFORCE/실제 EXECUTE REVOKE는 별도 명시적 승인 전까지 금지**

## 후속
- 3B 역할·DB 커넥션 자격 격리: 아직 미구현.
- 3C 서버 Governed 비용 Runner 연결: 아직 미구현.
- 3D 운영 권한 철회: HOLD.
- D4 다중 세션 race/삭제/장애 검증, D5 운영 승격: HOLD.
