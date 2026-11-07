# 명하 운영 트랙 — PostgreSQL 개인정보 복구 원장 WORKLOG

- 트랙: `ops`
- 기준 로드맵: `docs/operations/PRODUCTION_OPERATIONS_EXIT_ROADMAP_20261107.md` Gate 1 / Phase 8 — DR 독립 개인정보 복구·연속성
- 기존 권한 기준: `docs/operations/POSTGRES_PRIVACY_RECOVERY_LEDGER_AUTHORITY_V1.md`
- 범위: 기존 주기적 보호 원장 작업의 **GitHub Actions 재실행 보관 파일 식별 오류** 수정. Production DB 데이터·정책·SQL/DDL·비밀값·RPO/RTO·DR 수용 기준 변경 없음.
- 별도 ops 통합 WORKLOG는 기존 `docs/operations/`에서 확인되지 않았고, Phase 8 개인정보 원장 전용 구현 이력을 여기 기록함. 기존 다른 하위 트랙 WORKLOG는 변경하지 않음.

## 2026-11-08 — 예약 원장 작업 RED 복구

### 작업 목표와 실패 원인
- 사용자 지정 원본: [예약 원장 #42404193088 Attempt 1](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42404193088), 실행 HEAD `3bdec3c162b132284498ebed38e15feaf32c0ff9`, 2026-11-08 KST **FAIL**.
- 실패 작업: `encrypted-off-db-privacy-recovery-ledger`, `Resolve prior governed privacy ledger artifact` 단계. 로그의 오류: `Prior successful ledger artifact is missing, ambiguous or expired; source continuity is unverified.`
- 최신 성공 선행 원장 [#42381192945](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42381192945) **Attempt 2 SUCCESS**는 동일 run ID에 활성 원장 artifact **2개**를 유지함: Attempt 1 `13577209175` (`20261107T142134Z`), Attempt 2 `13582736761` (`20261107T170058Z`). 두 개 모두 expired=false. 기존 `length == 1` 선별 조건이 이를 모호한 선행 증거로 거부. 이전 백업 [#42309503582](https://github.com/gycha0109-beep/MyeongHa/actions/runs/42309503582) artifact `13548176984` 다운로드 및 public manifest 검증 단계는 해당 실패 실행에서 통과함.
- GitHub attempt 2 job `128467737140`은 `17:00:36Z–17:01:01Z` 완료, 업로드 단계 `17:00:59Z` 성공. artifact `13582736761` created_at `17:00:59Z`; 이전 attempt 1 artifact는 `14:21:35Z` 생성. 따라서 **검증된 최신 성공 차수의 업로드 시간 구간에 속한 단일 artifact**를 구분할 근거가 존재함.

### 변경 파일 / 코드·테스트
- `.github/workflows/production-postgres-privacy-recovery-ledger.yml` — 기존 선행 성공 run을 유지하고, 정확한 최신 attempt/job/upload 단계 메타데이터를 읽어 artifact를 식별하도록 변경. 기존 암호문·체크섬 검증과 사건 중복/누락 overlap 검사, Production read-only 권한, fail-close 제거 없음.
- `scripts/operations/select-privacy-ledger-predecessor.mjs` — run ID·branch·event·SHA, job attempt, 성공 업로드 시작/완료 구간과 artifact 생성 시각을 교차 검사. 최신 성공 차수에 일치하는 활성 artifact가 정확히 하나가 아니면 실패.
- `test/ops/production-privacy-ledger-predecessor.test.mjs` — 실측 재실행 2 artifact, 최신 차수 내 중복, 만료·없음·잘못된 run, 실행 차수/업로드 단계 불일치 및 workflow 보호 조건 검사.
- `docs/operations/OPS_PRIVACY_RECOVERY_LEDGER_WORKLOG.md` — 이 기록.
- 브랜치: `fix/ops/privacy-ledger-rerun-artifact-20261108`.
- 코드 커밋: `eade90dc2a28eec16bdc5b332c5036b4aae88cd7`, `9cb959233b6bf96ebe4db6110e9dccae412a0935`, 테스트 `817d06d6a36687a356cc2594d3aa44980a5c0493` (모두 `Watchtower-Track: ops`).

### 검증·남은 과제·다음
- **현재 확인:** GitHub 원본 실패 로그, 이전 성공 run attempt 2 job 메타데이터, artifact metadata 대조 완료. 코드·테스트 브랜치 커밋 확인. **수정 HEAD의 테스트·PR CI·실제 예약 원장 재실행 PASS는 아직 검증하지 않음.**
- **남은 과제:** PR 생성 및 영향 테스트·CI, 필요한 통합 CI, 자동 병합 후 **새 main SHA**의 원장 워크플로 실행 성공 확인. 과거 실패 run을 그 SHA 그대로 rerun해도 수정된 코드는 적용되지 않으므로 이를 완료 근거로 사용하지 않음.
- **다음 작업:** PR CI 결과를 기준으로 실패 시 같은 단위만 수정 → 성공 시 통합 CI 통과 후 병합 → 새 main에서 예약/수동 출처 런타임 검증 후 WORKLOG 근거 갱신. GitHub 커넥터에 워크플로 수동 dispatch 기능이 없으면 다음 예약 실행의 결과를 확인해야 하며 실행되지 않은 상태를 성공으로 주장하지 않음.
- **블로커/승인:** 승인된 GitHub Actions 읽기 권한 내 코드 수정이며 Production 직접 변경·시크릿 접근 없음. Production DB·보관 정책·검증 우회가 필요한 경우 별도 사용자 승인 없이는 수행하지 않음.
