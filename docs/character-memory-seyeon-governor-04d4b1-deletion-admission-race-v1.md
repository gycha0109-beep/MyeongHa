# 세연 Cost Governor D4B-1 — 삭제 우선 예약 경합
Watchtower-Track: character-memory

## 범위 및 증거
- D4A PR #1903 다음 단계. 폐기 가능한 myeongha_seyeon_d4b_test DB에서만 수행합니다.
- 기존 committed post-turn Attempt 합성 fixture와 전용 합성 Governed 로그인 사용. 유료 모델 호출 없음.
- 계정 삭제 시작 cmd_start_account_deletion_v1은 canonical Subject 행을 FOR UPDATE로 잠그고 deletion_pending으로 전환합니다.
- 기존 Governed Start의 글로벌 예산 잠금 이후 활성 Subject 상태를 행 잠금으로 재검증하지 않는 경합을 차단합니다.

## 보강한 계약
- 신규 1650 마이그레이션만 추가, 기존 마이그레이션 변경 없음.
- global daily budget FOR UPDATE → active canonical Subject FOR SHARE → Attempt 검증 및 Ledger 쓰기 순서.
- DELETE 시작/Finalizer와 같은 Subject 상태 행을 직렬화합니다.
- active가 아니면 SQLSTATE 23514, constraint seyeon_ai_governor_subject_inactive.
- 별도 SECURITY DEFINER helper는 Subject 현재상태 + FOR SHARE만 처리. 고정 search_path, private cost-meter-only EXECUTE, 생성/ACL 단일 트랜잭션.
- OFF 호환 레거시 RPC, Production 권한, 유료 API, 운영 마이그레이션은 변경하지 않음.

## 결정적 독립 세션 재현
1. 세션 L: 글로벌 예산 FOR UPDATE 후 FIFO 신호 대기.
2. 세션 A: Governed START 실행, pg_stat_activity.wait_event_type=Lock로 대기 확인.
3. 세션 B: 승인된 계정 삭제 시작을 COMMIT.
4. FIFO로 L의 잠금을 해제.
5. A가 23514 + 정확한 inactive 제약으로 거부되는지 확인.
6. 원장 및 예산 점유 0, 삭제 후 재시도도 거부되는지 확인.

## 후속 범위
예약 우선 삭제, Finalizer의 실제 Attempt 삭제, Settle/Delete, cleanup/Counter, 다중 Subject, 정산 장애 및 timeout은 D4B 후속 단계에서 검증합니다. Production migration 이력 #1887, 전용 LOGIN 및 ENFORCE, 레거시 REVOKE는 별도 승인 전 HOLD입니다.
