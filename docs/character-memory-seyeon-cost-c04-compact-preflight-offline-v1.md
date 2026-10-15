# COST-04 — 통합 사전 분류 지시문 축약 후보 (무과금 오프라인)

Watchtower-Track: character-memory
Status: **OFFLINE TEST ONLY / COST-02 and COST-05/06 HOLD**.

## 구현
- `scripts/seyeon-cost-c04-preflight-compact-offline-v1.mjs`: 압축된 독립 후보 문자열. Truth-bearing user/Se-yeon/shared-event/status/authority/meta claim 분리, 가족/과거연애 표면·상세/트라우마 공개 질문, 한국어 주어 생략과 허위 과거 연애 구분, 원문 입력 불신 경계를 명시한다.
- `test/seyeon-cost-c04-preflight-compact-offline-v1.test.ts`: **Production 파일을 수정하지 않는 테스트 전용 wrapper**에서만 지시문을 교체한다. 실제 Provider 직렬화 및 서버의 Integrity/Disclosure classification Guards는 동일하게 적용하고 C02의 서로 다른 합성 Gold 300건에서 모델 응답을 사전 정의한 동일 Oracle로 반환한다. 동일 request payload/model/schema/store=false/security boundary 유지와 실제 UTF-8 바이트 감소를 검증한다.

## 해석 제한 및 운영 경계
- **합성 Oracle가 이미 정답을 돌려줍니다.** 300건 서버 Guard 결과 일치는 Compact prompt가 실제 모델에서도 정답을 낸다는 증거가 **전혀 아닙니다**. 모델 분류 누락·오탐·인젝션 저항·캐시/Reasoning/output/실청구·세연 자연스러움의 값은 모두 UNKNOWN.
- 현재 기존 Shadow 지시문 및 운영 5회 경로는 불변. 통합 분류기를 조정/배포하지 않으며 외부 Provider API/Secret `OPENAI_API_KEY2`를 사용하지 않는다. 보호된 두 workflow의 `if: ${{ false }}`는 유지한다.
- 유료 A/B를 수행하려면 **모델 정확한 SKU·단가, 최대 호출 횟수·입출력 토큰 캡·재시도 규칙·총 비용 상한 및 중단 조건**을 승인·확인하고 별도 승인된 평가 경로/영수증 검증이 필요하다. 비용 사고 #1816와 DB #1887 HOLD를 우회하지 않는다.
