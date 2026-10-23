# AI 보안 구현 배치 — 2026-10-24

Watchtower-Track: security

기준: `main@1fce280a` → `codex/ai-security-implementation-20261024`.
실행 순서의 정본은 [실행 로드맵 §62](SEYEON_AI_SECURITY_EXECUTION_ROADMAP_V2_20261016.md#62-2026-10-24-구현-우선-실행-큐와-현재-종료-경계)다.

## 구현 결과

- 실제 Preview Worker가 encoded Chat/legacy rewrite marker를 API·정적 자산보다 먼저 기존 deny-only 분류기로 처리한다. 과거 단독 보안 함수와 현재 Worker 사이의 누락된 호출을 연결했다. 공개 Chat·개인정보 조회·Provider 호출을 허용하는 경로는 추가하지 않았다.
- 원본 Memory 1건의 첫 응답용 Node HTTP ingress를 추가했다. Member/정확한 body/동일 socket 검증 후 기존 G1→모델→G2 runtime과 현재 Grant의 G3 잠금 조회·송출을 연결한다. 일반 응답 본문은 DB 원본에서만 가져온다. Node handler는 미마운트다.
- 기존 zero ingress와 새 positive ingress는 동일 입력·인증·중단·고정 오류 경로를 사용한다. 기존 zero export와 동작은 유지했다. client가 어느 경로를 실행할지 선택하는 mode/flag를 추가하지 않았다.
- G2 준비 검사의 잘못된 7-UUID 시그니처를 실제 8-UUID+JSONB+3-text와 일치시켰다. 현재 실행 Role의 EXECUTE도 확인한다. 실제 권한 부여/정책 변경은 없다.
- 로드맵은 구현 90%/검증 10%의 작업 배분으로 갱신했다. 보안 완료율 또는 G0~G6의 90% PASS를 의미하지 않는다.

## 현재 검증 증거

환경: Windows/Node `v24.14.0`, Vitest `4.1.11`, 저장소 lockfile로 `npm ci --ignore-scripts --no-audit --no-fund` 수행. 신규 의존성/lockfile 변경 없음.

| 실행 | 결과 | 입증 범위 |
| --- | --- | --- |
| `npx vitest run test/seyeon-first-positive-memory-direct-node-http-ingress-v1.test.ts test/seyeon-first-positive-memory-node-delivery-v1.test.ts test/seyeon-first-zero-direct-node-http-ingress-v1.test.ts test/seyeon-first-zero-node-turn-delivery-v1.test.ts test/seyeon-node-original-grant-send-boundary-v1.test.ts` | **64/64 PASS** | 실제 loopback socket + 합성 DB/runtime. 준비 확인→runtime→원본 조회→finish→COMMIT 순서, revoked 원문 비공개, 인증/요청 거부 및 실패 비노출 |
| `npx vitest run test/cloudflare-preview-cd.test.mjs test/seyeon-cloudflare-ops-router-handoff-offline-v1.test.ts test/seyeon-cloudflare-protected-chat-route-guard-v1.test.ts` | **101/101 PASS** | Worker fetch 함수 직접 실행, 합성 ASSETS/Auth; alias의 503 및 Auth/Provider/ASSETS 0회, 일반 정적 자산 비간섭 |
| `npm run typecheck` | **PASS** | root 및 api-client/web/mobile workspace 타입 검사 |
| `npm run build` | **PASS** | 저장소 TypeScript build |

Cloudflare 변경 검토 시 [공식 best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Fetch handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/) 및 임시 폴더에 받은 `@cloudflare/workers-types@5.20261023.1`을 확인했다. 저장소에 해당 패키지를 설치/추가하지 않았다.

최종 코드 한 번 재검토: 새 Critical/High·권한 우회·본문 노출 발견 없음. 실제 DB/외부 transport의 권한 증명으로 해석하지 않는다. GitHub exact-head CI/Full Integration과 병합·배포 상태는 이 로컬 증거와 별도다.

## Architecture Check

- Docs updated: yes — 실행 로드맵 §62와 본 기록.
- Ghost-code risk: findings — positive Node handler는 G0/SRC-25/DB/transport 승인 전 미마운트이며 배포 기능으로 계산하지 않는다. Worker alias 분류기는 실제 entrypoint caller에 연결되어 있다.
- 새 도메인 category/클라이언트 mode/fallback/별도 normalization 없음. 기존 zero/positive 경로는 공통 Node ingress를 공유한다. 기존 Governor·Pin·Commit·locked send를 재사용하고 새 inference/workflow/DDL/RLS/EXECUTE를 만들지 않았다.

## 잔여 게이트와 상태

**로컬 구현 경계 VERIFIED / 운영 종단 IMPLEMENTED_UNVERIFIED / 트랙 종료 HOLD.**

1. G0/SRC-25: 실제 type/schema/projector와 original+derived 출처 폐쇄 및 취소/송출 계약의 기술 판정 필요.
2. 기존 SQL Draft #2422의 G1/G2/G3 및 private accept·원본 Message/Outbox/Registry 후보는 미적용. 운영 Owner/EXECUTE/DDL 변경 승인과 PG 2세션 race·Role·DR을 이 작업이 대체하지 않는다.
3. G0-D04: Node finish는 외부 Vercel/Cloudflare/브라우저 S/ACK 증거가 아니다. 직접 Node handler를 Fetch/proxy에 연결하지 않았다. History/Replay/Worker 공개는 기존 HOLD.
4. G4~G6: 실제 예산·운영 DB/DR·승인된 배포 transport·최종 제한 smoke가 필요하다. 유료 호출/공개/운영 데이터 변경/production 배포는 실행하지 않았다.

사용자 AGENTS.md의 승인 경계에 따라 main 병합·DB schema/migration/ACL·인증/개인정보 정책·production 배포/traffic은 별도 명시 승인 대상이다. 기존 다른 작업 변경은 이 배치에 포함하지 않는다.
