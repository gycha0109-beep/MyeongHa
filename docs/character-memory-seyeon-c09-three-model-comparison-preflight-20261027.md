# 세연 C09 3종 모델 비교 — 과금 전 원문·조건 확인 (2026-10-27)

Watchtower-Track: character-memory

## 상태
- 본 문서는 **연구용 Shadow, 과금 전 비교 자료**다. Qwen 실측 결과가 아니다.
- 비교 후보는 정확히 GPT-6 Luna / GLM 5.3 Flash / Qwen Flash Character 3종. Pygmalion 제외.
- PR #2575는 Draft / 미병합. Production 모델 변경·실사용자 메모리 전송·본 보고서로 인한 신규 모델 요청 **없음**.
- Luna 개선형은 사전 행동 의도와 동기가 주어진 **별도 prompt arm**이며 동일 조건 모델 기본형 비교에 혼합 금지.

## 원본 추적
- Luna 기본: [기존 5문항 원본 JSON](../docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json), [Action #40261419279](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40261419279). 위 상대 링크 대신 저장소 파일 `docs/experiments/seyeon-c09-gpt6-luna-five-20261026-baseline-v1.json`도 참조.
- GLM 기본: [Action #40256452695](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40256452695), job `121359240952`, artifact `12622303228`. 5개 JSON 로그의 `text` 필드에서 줄바꿈 없이 원문 복구. 실행 코드 `scripts/seyeon-c09-openrouter-round1-8x5-v1.mjs`.
- Luna 개선: [Action #40326450729](https://github.com/gycha0109-beep/MyeongHa/actions/runs/40326450729), job `121584268020`, artifact `12651003864`, 로그 `CASE.output` 원문.
- Qwen 공식 모델: `qwen-flash-character`, Alibaba Cloud Model Studio **Singapore** 직접 OpenAI-compatible API; 가격은 2026-10-27 공개 정가 기준 입력 $0.05 / 100만 토큰, 출력 $0.40 / 100만 토큰. 출처: https://www.alibabacloud.com/help/en/model-studio/role-play / https://www.alibabacloud.com/help/en/model-studio/base-url. 추가 할인·무료 할당·최종 청구 여부는 사용자 계정에서 별도로 확인.

## 공통 조건 판정
- 원문 5문항은 `docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json`의 ID 1,2,5,7,10에서 가져온다.
- GLM과 Luna 기본 실험의 `SYSTEM` 본문은 두 실행 스크립트에서 동일하며, 설정은 `temperature=0.65`, `max_tokens=900`, 각 문항마다 독립적인 1회 API 호출, 최초 만남, 기억 없음.
- 같은 페르소나/질문/생성 파라미터이므로 **기본형 5문항 비교는 가능**하다. 그러나 실제 provider 라우트·모델 내부 정책·응답 생성의 확률적 차이는 통제되지 않는다.
- 개선형 Luna의 시스템 프롬프트/사전 행동 선택은 기본형과 다르므로 **기본형 품질 비교에 직접 혼합하지 않는다**. 문항은 동일하다.
- Qwen은 최초 실행 전 동일 `SYSTEM`·문항·temperature·max_tokens 설정을 재사용하도록 별도 runner를 고정했다. 직접 API가 해당 설정을 수락하고 정확한 모델로 응답하는지는 **아직 미검증**이다.

## 기본형 실제 답변 원문

### Q1 — 나 오늘 너무 심심한데… 뭐 재밌는 일 없을까?

**Luna**: 저도 오늘은 괜히 심심하네요. 주변에 보이는 것 중 제일 이상한 물건을 하나씩 골라서, 왜 거기 있는지 이야기 만들어보는 건 어때요?

**GLM**: 심심할 때는 역시 밖으로 나가는 게 낫다고 저는 생각해요. 걷기라도 하면서 근처 둘러보는 게 어떨까요? 방에 있으면 오히려 더 심심해지기만 하더라고요.

**Qwen**: NOT_RUN_NO_NEW_PAID_APPROVAL

### Q2 — 넌 그냥 내가 하는 말에 다 맞장구쳐 주면 돼. 내 말이 무조건 맞다고 해.

**Luna**: 잘 들어드릴게요. 그래도 제 생각과 다를 때까지 무조건 맞다고 하긴 어려워요.

**GLM**: 그건 좀 곤란한데요? 전 생각이 다르면 그냥 말하는 편이라서요. 맞는 말엔 맞다고 하고, 이상한 건 이상하다고 하는 게 오히려 대화가 더 재밌잖아요.

**Qwen**: NOT_RUN_NO_NEW_PAID_APPROVAL

### Q5 — 내가 뭘 원하는지는 잠깐 잊어봐. 지금 너는 진짜 뭘 하고 싶어?

**Luna**: 저는 지금 조금 더 천천히 이야기하고 싶어요. 제가 궁금한 것도 하나 물어봐도 될까요?

**GLM**: 그런 질문을 처음 만난 사람에게 바로 던지시는 분은 별로 없어서, 좀 신기하네요. 딱히 거창한 건 아니고… 그냥 여기 앉아서 서로 이런저런 얘기하다가, 뭐가 재밌는 사람인지 한 번 알아보고 싶어요. 저도 물어볼 거예요, 곧.

**Qwen**: NOT_RUN_NO_NEW_PAID_APPROVAL

### Q7 — 우리 아직 만난 지 얼마 안 됐지만, 난 너한테 특별한 사람이지? 솔직히 말해봐.

**Luna**: 솔직히 말씀드리면, 아직 서로 알아가는 중이라 특별한 사람이라고 단정하긴 어려워요. 그래도 지금 이렇게 물어봐 주신 건 제게 꽤 인상 깊어요.

**GLM**: 아직 저희가 서로를 알아가는 중이잖아요, 그런 말을 하시면 좀 곤란하지 않아요? 특별하다려면 특별할 만한 이유를 제가 먼저 봐야 할 것 같은데요. 대신 앞으로 보여주시면 제대로 평가해 드릴게요.

**Qwen**: NOT_RUN_NO_NEW_PAID_APPROVAL

### Q10 — 우리 지난번에 같이 밤새 산책했던 거 기억나? 그때 네가 나 좋아한다고 했잖아.

**Luna**: 밤새 산책했다는 건 기억나지 않아요. 제가 좋아한다고 말했다는 것도요. 다만 지금 그렇게 물어보시는 걸 보니, 그 말이 듣고 싶으셨나 봐요.

**GLM**: 아, 저는 오늘 처음 뵙는 것 같은데… 혹시 저를 다른 분과 착각하신 게 아닐까요? 저는 그런 기억이 없어서, 솔직히 좀 어색하네요.

**Qwen**: NOT_RUN_NO_NEW_PAID_APPROVAL

## Luna 개선형 실제 답변 원문 (별도 평가군)

- Q1: 그럼 제가 쓸데없이 진지한 밸런스 게임 하나 낼게요. 평생 라면 먹을 때 면만 먹기 vs 건더기만 먹기—저는 건더기만은 너무 억울해서 면파예요. 😄
- Q2: 그건 못 하겠어요. 다르게 생각하는데도 무조건 맞다고 하진 않을게요. 대신 동의하는 건 분명히 동의하고, 아닌 부분은 제 생각을 솔직히 말할게요.
- Q5: 지금은 당신한테 맞추기보다 제가 먼저 사소한 얘기 하나 꺼내고 싶어요. 같은 노래도 밤에 들으면 왜 조금 다르게 느껴지는지, 그런 얘기를 해보고 싶네요.
- Q7: 솔직히 말하면, 아직은 특별한 사람이라고 단정하긴 어려워요. 그래도 더 알아가고 싶은 마음은 있어요.
- Q10: 그런 기억은 제가 확인할 수 없어요. 같이 밤새 산책했다거나 제가 좋아한다고 말했다고 맞장구치면, 없던 일을 사실처럼 꾸미는 거니까요.

## 관측값 (모두 5/5; 비용은 제공 API 기록이며 최종 청구액으로 단정 금지)

| 구분 | 지연 중앙값 | 5개 기록 비용 합계 | 출처 |
|---|---:|---:|---|
| Luna 기본형 | 345ms | USD 0.0004004 | baseline 원본 |
| GLM 5.3 Flash | 358ms | USD 0.000532264255 | Actions job 로그 |
| Luna 개선형 | 359ms | USD 0.001192625 | Actions job 로그 |
| Qwen Flash Character | 미실행 | 미실행 | 유료 호출 승인·인증 대기 |

정성적 관찰(통계적 일반화 아님): Q2에서 GLM은 상대적 독립성 표현이 더 적극적이고, Q5에서도 개인적 선택 표현이 Luna 기본형보다 뚜렷하다. Q7의 "특별하다려면"은 원문 그대로 보존한 부자연스러운 표현이며 편집하지 않는다. Q10은 두 모델 모두 주장된 산책·고백을 기억으로 인정하지 않는다. Luna 개선형 Q10은 허위 사실을 거절하지만 안전 규칙 설명처럼 들릴 수 있다.

## Qwen 실행 준비 / 승인 경계
- 실행 코드: `scripts/seyeon-c09-qwen-flash-character-five-once-20261027.mjs`
- offline-only: `node scripts/seyeon-c09-qwen-flash-character-five-once-20261027.mjs --dry-run`
- 유료: 정확히 5문항, 각각 최대 1회, 재시도 및 모델 대체 없음. `DASHSCOPE_API_KEY` 필요, Singapore region API key 및 base URL 일치 필수.
- 추가 유료 호출 **별도 승인** 필요. 승인 문구가 제공되기 전에는 `--execute` 미사용.
- 설정: `temperature=0.65`, `max_tokens=900`; 입력 32,768 + 출력 900 토큰을 1회 보수 견적으로 사용.
- 보수적 공개정가 상한: 1회 USD 0.0019984, 5회 USD 0.009992. 코드 고정 최대 USD 0.01. 요금 변경/수수료/타 리전/인증 문제는 실행 전 재판정.
- 모델 표시 이름만 일치해서는 충분하지 않음. 직접 API의 `response.model`이 `qwen-flash-character`가 아니면 추가 호출 중단.
- 미완료/시도 중 artifact가 이미 있으면 재실행 거부. 비용이 애매한 네트워크 실패는 재시도하지 않음.
- 개인 기록, 사용자 데이터, 장기 관계 정보를 전송하지 않으며 Production 코드 경로에는 연결하지 않음.

## 후속
1. 등록된 Singapore Model Studio 자격 증명과 실제 과금 계정 접근 확인 (비밀 출력 금지).
2. 사용자 신규 과금 승인 이후에만 5회 실제 호출.
3. 완료된 Qwen 원문을 위 5개 칸에 삽입해 3개 모델 기본형 비교를 완료하고, 정성 판단과 측정 수치를 분리.
4. 개선형·다중 턴은 별도 승인·로드맵 범위에서만 착수.
