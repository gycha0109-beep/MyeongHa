# 여울 유료 GEPA 준비: OpenRouter 제공업체 근거 사전검증 v1

> 연구 전용 · 실제 유료 호출 비활성 · GitHub Actions에는 합성 메타데이터만 입력

## 데이터 원천과 검사 범위

- 공식 모델별 제공업체 명세: https://openrouter.ai/docs/api/api-reference/endpoints/list-all-endpoints-for-a-model
- 공식 ZDR 제공업체 미리보기: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints-zdr
- GET /api/v1/models/{author}/{slug}/endpoints 및 GET /api/v1/endpoints/zdr의 **서로 별도 수집한 응답**을 동일 모델·제공업체 식별자로 대조한다.
- scripts/character-optimization/yeoul-provider-evidence-v1.mjs는 직접 HTTP를 호출하지 않고, 연구자가 로컬에서 입력한 두 API 응답 객체를 검사한다. API 키·사용자 대화·비공개 평가 원문은 받지 않는다.
- 검사: 모델별 유일 제공업체 엔드포인트, ZDR 목록 포함 여부, 활성 상태, 지원 파라미터, 입력·출력 토큰 상한, 캡처 시각(기본 1시간 이내), 입력/출력/요청 단가 문자열.
- API 제공 가격은 USD/토큰 및 USD/요청으로 해석하고, 정수 나노달러 올림 처리로 **입력·출력·요청 세 항목의 부분 비용**만 계산한다. 추론·캐시·이미지·계층형 요금·추가 공급자 수수료 등은 미확인으로 남겨 전체 최악 비용이라고 주장하지 않는다.

## 안전·승인 경계

- 제출된 API 응답 JSON은 위조되거나 오래됐을 수 있다. 이 검사는 메타데이터 형식·목록의 일관성을 확인할 뿐, 공식 응답의 인증·실제 가용성·청구 요금·공급자 라우팅/ZDR 적용을 입증하지 않는다.
- 결과의 providerRoutingCandidate는 실제 실행 설정이 아닌 **검토용 제안**이다. 제공업체 제한, 대체 업체 금지, 필요한 기능, ZDR, 데이터 수집 거부를 실제 외부 통신에서 강제한다는 보장은 없다.
- 모든 결과는 upstreamSnapshotAuthenticated=false, pricingCompleteAndAuthoritative=false, externalCallsAuthorized=false, paidExecutionReady=false.
- 여울 학생 후보 모델은 deepseek/deepseek-v4.1-flash-1017. 반사·심사·최종 비공개 평가 모델과 업체는 별도 결정/검증이 필요하다.
- 사용자 총예산 상한·역할별 호출 횟수/재시도 상한·가격 유효성·신뢰 가능한 승인 저장소·청구 대사·최종 비공개 평가셋이 없으면 유료 GEPA 파일럿은 HOLD 상태를 유지한다.
- 현재 공식 모델별 가격 표시는 제공업체마다 다르게 변할 수 있으므로 화면에 표시된 최저 단가를 지출 허가로 사용하지 않는다.

## 테스트·문서화

- 로컬 합성 테스트: node --test scripts/character-optimization/yeoul-provider-evidence-v1.test.mjs
- 정상 및 누락 ZDR, 공급자 중복, 잘못된/만료된 시각, 미지원 파라미터, 초과 토큰, 잘못된 가격, 비용 정수 올림, 유료 승인 실패 경계를 다룬다.
- 실제 OpenRouter API 키, 유료 모델 호출, 사용자 대화, 가격 원장 또는 캐릭터 운영 모델을 변경하지 않는다.
