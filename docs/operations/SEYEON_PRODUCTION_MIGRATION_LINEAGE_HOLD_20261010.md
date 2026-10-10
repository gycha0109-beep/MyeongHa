# 세연 Production DB 마이그레이션 이력 정합성 — 읽기 전용 조사 / 운영 HOLD

Watchtower-Track: ops
판정 기준일: 2026-10-10
Owner 이슈: [#1887](https://github.com/gycha0109-beep/MyeongHa/issues/1887)
연계 보안 원장: [#1866](https://github.com/gycha0109-beep/MyeongHa/issues/1866), [#1843](https://github.com/gycha0109-beep/MyeongHa/issues/1843)

## 요약 판정

**Production 이력 불일치가 재현되었으며, 운영 DB 배포·복구 승인 증거가 없습니다. `HOLD_OWNER_RECONCILIATION_REQUIRED`.**

아래 결과는 명하 Supabase 프로젝트 `cnsfpcdiyofqvhpcegfc`에 연결하여 **읽기 전용 SQL SELECT 및 Supabase list_migrations**만 실행한 관측입니다. Production SQL 변경, 이력 수리, 역할 변경, 백업/복구, 유료 AI 호출은 **실행하지 않았습니다**.

### 운영 DB에서 확인된 사실

| 항목 | 관측 |
| --- | --- |
| PostgreSQL | 17.6 |
| 복구 이력 버전 | `20261008090417` |
| 복구 이력 이름 | `seyeon_runtime_1460_1510_acl_before_owner_recovery` |
| 이력에 저장된 SQL | 단일 Statement, 104,021 bytes |
| 저장된 Statement MD5 | `f70776d8c0f6369f6f13484ba9fa2271` |
| 개별 `1460~1510` | 모두 6개가 이력에 존재 |
| 개별 이력의 SQL | 모두 NULL / 0 bytes |
| `1520~1640` 이력 | 확인된 13개 번호 전부 미적용 |
| `chat_turn_attempts` G1-B2 Pin 컬럼 | 0개 |
| `cmd_mark_seyeon_chat_context_ready_pinned_v1` | 없음 |
| 기존 `cmd_commit_seyeon_chat_turn_runtime_v2` | 있음 |
| 기존 3인자 Context-Ready 함수 | `myeongha_api_executor`는 EXECUTE 가능, 공개 DB 역할은 거부 |

MD5는 **동일 Statement 식별을 위한 참고값**이며, 신뢰된 서명이나 배포 승인 증명이 아닙니다.

복구 본문은 기존 `1460/1470/1480/1490/1500/1510` 이력·Owner Role 등이 이미 존재하면 오류를 내도록 시작하며, 끝은 Server-only Chat/Post-Turn 함수의 실행 권한 postcheck입니다. 이 때문에 **104KB 원본 SQL을 현재 migrations 디렉터리에 뒤늦게 그대로 넣으면**, 정상 fresh DB에서 개별 마이그레이션 다음에 **중복 재실행 시도**가 발생할 수 있습니다. 별도 조치 없이 복사·재실행해서는 안 됩니다.

이 사실들은 *복구 SQL 실행 뒤 빈 개별 이력 6개를 별도로 등록했을 가능성*과 양립하지만, 실행 일시·실행자별 단계·외부 도구의 실제 절차를 단정할 수는 없습니다.

### GitHub 증거

- G1-B2 [PR #1878](https://github.com/gycha0109-beep/MyeongHa/pull/1878): `b531770db687c6c4b8691750586c62601775edd8`로 main 병합.
- [PR Integration PASS](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38045217330), 병합 후 main CI 등 PASS. **온라인 배포 증거가 아닙니다**.
- [Supabase Production FAILED](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38049418757): `20261008090417` 원격 이력이 로컬에 없어서 **dry-run 중단, 미적용**.
- [PostgreSQL DR Readiness FAILED](https://github.com/gycha0109-beep/MyeongHa/actions/runs/38049418749): DR 증거는 1310, 저장소 frontier는 `20261008043000`.
- 저장소의 `supabase/migrations/`에 `20261008090417_*.sql` 없음. 공식 main 코드 검색 및 해당 경로 Git commit 이력 조회로도 원본 발견되지 않음.

## 재현 절차 (운영 DB 읽기 전용)

권한을 보유한 운영 담당자가 아래 파일을 **읽기 전용으로 실행**합니다. 인증정보는 기존 승인된 비밀 관리 경로에서 제공하며 문서·로그에 기록하지 않습니다.

```bash
psql -X -v ON_ERROR_STOP=1 -f scripts/operations/seyeon-production-migration-lineage-readonly.sql
```

현재 관측에 대한 기댓값은 `investigation_status = HOLD_OWNER_RECONCILIATION_REQUIRED`입니다. `HOLD`는 **성공/실패 배포 판정이 아니라 원인 조사 상태**입니다. 다른 결과가 나오면 원격 상태가 달라진 것이므로 앞선 증거를 폐기하고 재조사해야 합니다.

## Owner 의사결정과 승인 전 금지 작업

1. **원본 출처 확인**: DB 내부에 보존된 104KB SQL 원본을 안전한 운영 보관소에 보존하고, 저장소 개별 1460~1510 및 후속 20261008043000의 의미·권한과 비교합니다. 본문을 공개 이슈나 일반 CI 로그에 유출하지 않습니다.
2. **마이그레이션 이력 정합성 접근 결정**: 역사적 번들 버전의 재현 가능한 별도 아카이브, 정합성 검증 후의 조건부 이력 인식, 또는 Owner 승인하 수리 중 한 방식을 선택합니다. *다른 SQL을 원본과 같은 버전으로 등록하거나 빈 Marker를 승인 없이 조작해서는 안 됩니다.*
3. **Pending 1520~1640 검토**: 현재 Production에는 G1-B2 Pin 기능이 없습니다. `supabase db push --include-all`은 세연 외 다른 마이그레이션까지 실행할 수 있으므로 사전 SQL 차이·의존성·백업·복구·배포창을 별도 검증해야 합니다.
4. **DR 증거**: 정합성 복구와 승인된 Production 적용 뒤, 실제 운영 Schema 기준으로 governed backup 및 격리 restore를 검증합니다. #1536의 이미지 digest 요구사항도 별도 확인합니다.
5. **승인 기록**: 승인된 배포 범위와 Owner, 정확한 main SHA, 이력 대조·실제 실행·후검증·복구 증거, RPO/RTO를 #1887에 기록한 뒤 #1866 G6에서만 사용합니다.

금지: 근거 없는 `supabase migration repair --status reverted 20261008090417`, 원격 복구 SQL 임의 재실행, 빈 1460~1510 Marker의 비승인 변경, 보안/DR 게이트 비활성화, Production Route 및 양수 Personal Projector 활성화.

## 종료 기준

현재는 **A: 원격 이력·실제 코드 상태 포렌식 확인 / B: 읽기 전용 재현 명세 마련 / C: Production 적용·DR Owner 승인 필요**입니다. #1887은 C 전에는 닫지 않습니다. 추가 비용 발생 및 운영 변형 작업은 별도 보고·승인 대상으로 유지합니다.
