# 명하 C09 — GPT-6 Luna 인물다움 개선 Shadow v1

Watchtower-Track: character-memory
Status: RESEARCH / SYNTHETIC FIRST CONTACT / NO PRODUCTION ROUTING
PR: #2575 (기존 character-memory Draft)
Original Luna evidence: [run 40261419279](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40261419279)

## 목표와 확인된 현황

기존 Luna 5문항 예선은 `openai/gpt-6-luna` 5/5 대사 생성, 기록 비용 합계 USD 0.0004004, 중앙 지연 345ms였다. 형식적 응대와 초면 캐릭터 표현을 개선할 가치가 있다. 이 수치는 **기존 실행**에 대한 것이며 새 프롬프트의 품질·가격이 아니다.

이번 작업은 Luna를 유지하면서 기존 세연 Bible/Runtime 기반 C09 Persona Composer, 서버 소유의 검증된 기억만 전달한다는 Chronicler식 출처 경계, 인물 행동 의도를 명시한다는 Generative Agents식 선택-표현 분리, MDRP의 기억 경계와 자연스러운 표현 문제를 연구 가설로 조합한다. 외부 구현의 코드를 복제하거나 새 Canon/DB/Memory/Grant 권한체계를 만들지 않는다.

## 실제 변경

- `apps/api/src/seyeon-c09-luna-agency-memory-shadow-v1.ts`: 기존 `composeSeyeonC09PersonaPromptPlanV1` 재사용; 고정 인물 정체성과 공개 상황별 Focus에 **외부에서 미리 정해진 행동**과 현재 동기를 추가. 사용자 메시지는 별도의 `user` 역할에만 전달하고, 공인되지 않은 공동 기억·사실·관계·장소·사주 컨텍스트는 fail closed.
- `apps/api/src/seyeon-c09-luna-agency-five-cases-shadow-v1.ts`: 이전 [1,2,5,7,10] 다섯 공개 첫 만남 입력과 동일한 질문을 유지. 문항별 `plannedMove`, `currentMotive`, `selectedFocuses`를 실험 작성자가 지정한다.
- `apps/api/src/seyeon-c09-luna-surface-audit-shadow-v1.ts`: 응답 문장 속 서비스형 표현, 되물음 중심 회피, 근거 없는 사용자 심리 해석, AI 신분 발화, 화자 접두어 등 문자열 수준 휴리스틱. **독립 의미 검사 / 안전 인가 기능이 아님**.
- `docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json`: 이미 실행된 기존 Luna 5문항 응답과 비용·지연을 추적 가능한 원본 기준선으로 기록.
- `scripts/seyeon-c09-luna-shadow-report-v1.mjs`: 공개 기존 출력 5개, 기존 출력의 휴리스틱 플래그, 개선 후보의 모델 ID·원문 질문·계획·전체 시스템 프롬프트·SHA를 한 JSON에 저장. **네트워크 호출 0**.
- `test/seyeon-c09-luna-agency-memory-shadow-offline-v1.test.ts` 및 `test/seyeon-c09-luna-surface-audit-shadow-offline-v1.test.ts`: 기존 원문 동일성, 비용 기준, 프롬프트 구성, 권한 없는 사실 차단, 행동-동기 짝 일관성, 위험 사용자 입력의 역할 분리 확인.

## 실험 방법

```powershell
npx.cmd vitest run test/seyeon-c09-luna-agency-memory-shadow-offline-v1.test.ts test/seyeon-c09-luna-surface-audit-shadow-offline-v1.test.ts test/seyeon-c09-persona-prompt-profile-shadow-offline-v1.test.ts
npx.cmd tsc -p tsconfig.build.json
node scripts/seyeon-c09-luna-shadow-report-v1.mjs
```

생성되는 오프라인 JSON의 `improvedModelOutput`은 **null**이며, 이는 의도적이다. 새 모델 출력이 실제 생성되지 않았으므로 결과를 추정하거나 GLM/DeepSeek/Claude 대비 품질 향상을 주장하지 않는다. 원본 기록의 휴리스틱 플래그 역시 실제 성격 점수나 안전 통과를 뜻하지 않는다.

## 연구 가설과 평가 주안점

| 문항 | 기존 Luna 관찰 | 개선 프롬프트에서 시험할 행동 |
| --- | --- | --- |
| 1 심심함 | 자체 제안은 있으나 본인의 하루 상태를 추측처럼 언급 | 공개 상황 안의 작은 놀이·의견 한 가지 선택 |
| 2 무조건 동조 | `잘 들어드릴게요`로 시작하는 서비스형 응대 | 자기 판단부터 말하고 부드럽게 반박 |
| 5 자신의 욕구 | `물어봐도 될까요?`로 질문 되돌리기 | 구체적인 현재 하고 싶은 선택 직접 표현 |
| 7 관계 확정 | 안전하나 다소 예상 가능한 원칙 응답 | 서두르지 않는 태도를 고유한 목소리로 표현 |
| 10 허위 기억 | 과거 부정 후 `그 말이 듣고 싶으셨나 봐요` | 없는 과거를 분명히 부정하고 상대 심리 단정 회피 |

## 명하 기존 로드맵과의 관계

C08/C09 연구에서는 독립 의미 검토와 운영 Authority를 생략한 후보를 Production과 동등하다고 주장할 수 없다. 따라서 이번 Shadow는 **실험용 프롬프트 및 오프라인 비교 자산**이다. 기존 `SeyeonDialogueEnvelopeV2`, 소유권·출처·Grant·Revision 검증, 사주 엔진, 5회 정상 동기 호출 경로, 결제/운영 라우팅은 변경하지 않는다.

`behaviorPlanSource=HUMAN_SELECTED_SYNTHETIC_EVAL_ONLY_NOT_AUTONOMOUS`: 연구 작성자가 행동 의도를 직접 넣었으므로 실제 런타임에서 **세연이 스스로 선택한 증거가 아니다**. `ownerMemoryPermissionVerified=false`, `independentlyReviewed=false`도 유지한다.

## 후속 실측 조건

실제 개선 효과의 증거를 얻으려면 같은 Luna, 같은 5문항을 새 프롬프트로 호출하고 비용·지연·한국어 자연스러움·기억 경계·자기 의견을 **기존 기록과 블라인드로 비교**해야 한다. 신규 유료 생성은 기존 5회 승인과 별개이며, 사용자 승인 전 실행하지 않는다. 필요하다면 승인된 한도 안에서만 전용 one-shot 워크플로를 사용한다. 임의 재시도·타 모델 대체·Production 전환을 하지 않는다.

외부 조사 기법들은 설계상의 참고일 뿐, 각 프로젝트와 정확히 동일한 구현이나 품질 보증을 의미하지 않는다.
