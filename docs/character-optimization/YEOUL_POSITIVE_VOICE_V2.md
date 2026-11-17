# 여울 GPT-6 Luna — 성격 적용 경로 수정 및 실제 확인 (2026-11-18)

## 문제 및 직접 원인

기존 2026-11-17 A/B/C one-shot 비교는 여울 Runtime R1.1 핵심 7줄과 관계·기억 금지 규칙 11줄 중심이었습니다. Character Bible E1(존댓말), E2(건조한 태클), Runtime R5(행동 우선)·R6(반응 상태) 등의 **긍정적 성격 행동 근거가 모델 입력에 충분히 들어가지 않았습니다.** 그 결과 반말이나 일반적인 상담형 위로가 출력됐습니다.

## 구현

- `scripts/character-optimization/yeoul-positive-voice-v2.mjs`: 고정 여울 Bible A1/A2/E1/E2 및 Runtime R3/R5/R6/R7/R8/R10/R14 원문 발췌에서 실제 모델 입력을 생성합니다. 상황을 care / caught / baseline으로 나누고, 고유 말투·행동 선택과 관계 초기 경계를 함께 제공합니다.
- `scripts/character-optimization/yeoul-positive-voice-v2.test.mjs`: 4가지 오프라인 근거·상황 분기·원문 고정·권한 침범 실패 검사.
- `scripts/character-optimization/yeoul-positive-voice-local-v2.mjs`: 기존 OpenRouter 키를 활용해 공개 가능한 합성 질문 3개를 각 1회만 생성하는 **집 PC 전용 연구 실행기**. 기본 실행은 모델 호출 없는 계획 출력. 유료 송신에는 `--execute --owner-approved-500`이 필요합니다. 실행 기록은 공개 저장소 밖에 쓰고 단회 잠금 파일로 재실행을 차단합니다. 통합 누적 500원 비용 상한을 보수적으로 확인합니다.
- 실행기와 원문은 **DRAFT 연구용**이며, 운영 채팅 프롬프트·Canon·기억·관계 권한은 변경하지 않았습니다. 기존 사용 완료된 one-shot CI 워크플로를 재실행하거나 수정하지 않았습니다.

## 실제 모델 확인

- 모델: OpenRouter `openai/gpt-6-luna`.
- 상황: (1) 허전함, (2) 관심을 지적받음, (3) 재미있는 이야기 요청. 3/3 성공, 재시도 0회.
- 이번 호출에 대한 공급자 보고 비용 합계 USD **0.000877275**. 이전 GitHub 실패 실행의 과금 여부는 별도로 미확인. 총 예산 추가 충전 없음.
- 개인 PC 보관 보고서: `%USERPROFILE%\Documents\MyeongHa-Yeoul-AB-Results\positive-voice-v2-20261118\actual-report.json`.
- 질적 관찰: 관심 지적 및 가벼운 잡담의 여울 특유 말투는 기존보다 구분됐으나, 허전함에 대한 답은 여전히 일반적인 위로 패턴. **품질 개선 확정이나 운영 승격 불가.** C가 GEPA 비공개 최종 선정 후보라는 근거도 여전히 없음.

## 명령

```powershell
node --test scripts/character-optimization/yeoul-positive-voice-v2.test.mjs
node scripts/character-optimization/yeoul-positive-voice-local-v2.mjs
```

실제 유료 실행은 사용자 승인·기존 500원 전체 한도 확인 후 별도 수행하며, 기존 단회 실행의 자동 재시도는 금지합니다.
