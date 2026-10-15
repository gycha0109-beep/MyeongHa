# MyeongHa

명하는 **각 신의 대리자들과 지속적으로 관계를 맺으면서 사용자의 명식과 현재 삶의 기록을 함께 읽어가는 캐릭터 기반 사주 세계관 서비스**입니다.

## Current work roadmap / 현재 진행 우선순위

**[docs/ROADMAP.md](docs/ROADMAP.md)** — 현재 작업의 단일 통합 로드맵. **P0: 세연 AI 추론 비용 최적화 미완료**(5회→3회 Shadow 후보·소표본 비용 실측, 캐릭터 품질 검증·운영 적용·유료 평가 사고 해제 HOLD). **P1: 기억 동의/DB/History 보안 격리 후보**, 운영 전환 HOLD.

- 모델 유료 평가 워크플로 두 개는 비용 사고 때문에 계속 잠금. 문서/CI 성공만으로 재개 또는 완료 선언 금지.
- [실측·비교 상세](docs/character-memory-seyeon-real-api-path-eval-v1.md) · [비용 사고 차단](docs/SEYEON_SECURITY_BOUNDARY_EVAL_COST_HOLD_AND_NEGATIVES_V1.md) · [Draft PR #1985](https://github.com/gycha0109-beep/MyeongHa/pull/1985)

## Authority baseline

구현은 `/docs/MASTER_SPEC_INDEX.md`에서 시작합니다.

핵심 경계:

- Saju Engine: 명식 계산과 해석 의미 authority
- Character Runtime: 허용된 의미의 캐릭터 표현
- Relationship / World: 사용자-캐릭터 관계와 세계 상태
- MyeongHa backend: 사용자 데이터, 권한, idempotency, lifecycle authority

현재 `/docs/PACK_VALIDATION_REPORT.md` 기준으로 implementation scaffold는 시작할 수 있지만 final DDL / production baseline은 명시된 Source Gap과 OPEN-P0가 닫히기 전까지 승격하지 않습니다.

## Foundation status

공유 contract/domain foundation은 framework-neutral하게 유지하며, Web UI는 기존 화면과 URL을 보존하는 React/TypeScript/Vite 다중 페이지 구조로 단계 전환 중입니다.

- Node 24 / npm 11
- strict TypeScript
- React 19 / Vite 8 Web UI
- bounded shared contracts
- immutable versioned registry primitives
- fail-closed capability gate
- explicit character-grant snapshot helper
- API boundary skeleton

Mobile framework와 production database migration은 authority gap을 우회해 먼저 확정하지 않습니다.

## Runtime status

실제 production/runtime 실행 상태는 repository-local build 및 deployment-configuration 검사와 분리해 [`docs/RUNTIME_STATUS.md`](docs/RUNTIME_STATUS.md)에서 관리합니다.

특히 green `npm run check` 또는 READY 상태의 static Vercel deployment만으로 executable `/api` runtime이나 현재 production Supabase schema가 검증되었다고 간주하지 않습니다.
