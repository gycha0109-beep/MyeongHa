# MyeongHa

명하는 **각 신의 대리자들과 지속적으로 관계를 맺으면서 사용자의 명식과 현재 삶의 기록을 함께 읽어가는 캐릭터 기반 사주 세계관 서비스**입니다.

## Authority baseline

구현은 `/docs/MASTER_SPEC_INDEX.md`에서 시작합니다.

핵심 경계:

- Saju Engine: 명식 계산과 해석 의미 authority
- Character Runtime: 허용된 의미의 캐릭터 표현
- Relationship / World: 사용자-캐릭터 관계와 세계 상태
- MyeongHa backend: 사용자 데이터, 권한, idempotency, lifecycle authority

현재 `/docs/PACK_VALIDATION_REPORT.md` 기준으로 implementation scaffold는 시작할 수 있지만 final DDL / production baseline은 명시된 Source Gap과 OPEN-P0가 닫히기 전까지 승격하지 않습니다.

## Foundation status

첫 구현 단계는 framework-neutral contract/domain foundation입니다.

- Node 24 / npm 11
- strict TypeScript
- bounded shared contracts
- immutable versioned registry primitives
- fail-closed capability gate
- explicit character-grant snapshot helper
- API boundary skeleton

Web/Mobile framework와 production database migration은 authority gap을 우회해 먼저 확정하지 않습니다.
