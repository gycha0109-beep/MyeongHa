# 여울 GEPA 500원 — OpenRouter 실제 계정·제공업체 읽기 전용 사전점검

> 대상 트랙: character-runtime-lab · 실제 모델 생성/반사/심사 호출 0회 · 운영 설정 미변경

## 실제로 구현한 것

- OpenRouter 공식 고정 HTTPS 호스트에서 GET /api/v1/key, GET /api/v1/models/deepseek/deepseek-v4.1-flash-1017/endpoints, GET /api/v1/endpoints/zdr를 로컬 추론 API 키로 조회한다.
- 선택적으로 별도 관리 키를 사용하여 GET /api/v1/credits에서 **기존** 선불 잔액의 존재 여부만 확인한다. /key의 limit_remaining은 계정 잔액이 아니므로 두 값을 분리한다.
- 동일한 조회 시점의 모델별 엔드포인트와 ZDR 목록을 기존 yeoul-provider-evidence-v1 검증기에 전달한다. 지정한 공급자가 두 목록에 유일하게 존재하고 활성 상태이며 토큰 한도/요청 파라미터를 지원하는지만 검증한다.
- 연결은 GET·고정 OpenRouter 호스트·리디렉션 금지·응답 2MB 한도·10초 시간 제한으로 제한한다. 키, 정확한 크레딧, 계정 ID, 공급업체 응답 원문, 평가 대사는 출력하지 않는다.
- 실제 model ID는 deepseek/deepseek-v4.1-flash-1017로 검사한다. 공급자 태그는 조회 후 로컬에서 선정하고 다음 단계의 정책에서 고정한다.

## 로컬 실행 방법

Node 24+ 환경에서 별도의 비공개 셸 환경 변수만 설정한다. **.env, 키, 전체 응답 JSON, 비공개 평가 원문을 커밋하지 않는다.**

    OPENROUTER_API_KEY=<local-inference-key>
    OPENROUTER_MANAGEMENT_KEY=<optional-local-management-key>
    YEOUL_OPENROUTER_PROVIDER_TAG=<optional-pinned-provider-tag>
    node scripts/character-optimization/yeoul-openrouter-readonly-preflight-v1.mjs

위의 세 변수는 예시 이름이며 실제 값은 사용자 로컬에서만 공급한다. 공급자가 아직 선정되지 않았다면 TAG를 비워 읽기 전용 후보 목록만 확인한다.

Node 합성 테스트:

    node --test scripts/character-optimization/yeoul-openrouter-readonly-preflight-v1.test.mjs

## 중요한 미완료 조건

- 이 사전점검은 사용자 메시지·GEPA 후보를 외부로 보내지 않는다. **POST /chat/completions 송신기와 GEPA 역할별 단일 통합 게이트는 아직 없다.**
- 관리 키가 없거나 /credits가 확인되지 않으면 기존 크레딧은 미확인이다. 기존 크레딧이 존재해도 외부 호출 권한을 부여하지 않는다.
- GET 응답만으로 공급자 실제 선택, ZDR 준수, 가격 불변, 캐시·추론·수수료까지 포함한 최종 청구액은 입증하지 못한다. 기존 증거 검사기의 quote는 입력/출력/요청 부분 합계다.
- 반사/교사·심사·독립 최종 평가 모델의 동일한 조회·가격·호출 계획, 검증된 독립 평가 원본, 신뢰 가능한 사용자 예산 승인 원장, USD/KRW 일체형 실제 요청 예약과 최종 영수증 대사, 비공개 원본 격리가 필요하다.
- 이 결과를 유료 허가·500원 준수·GEPA 성능 개선·운영 반영으로 자동 승격하지 않는다. 유료 호출 0회, 크레딧 구매 0원, 운영 변경 0건이다.

## 공식 API 참고 (2026-11-12 확인)

- https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key
- https://openrouter.ai/docs/api/api-reference/credits/get-credits
- https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
- https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints-zdr
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/api/api-reference/generations/get-generation
