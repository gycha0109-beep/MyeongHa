# Seyeon Character Bible Prototype — Interactive Model Probe v0.1

> Date: 2026-09-23
> Track: product-commerce
> Status: RESEARCH EVIDENCE / NOT PRODUCTION AUTHORITY
> Character source: `docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_1.md`
> Context compiler: `packages/character-content/src/seyeon-bible-prototype-v1.ts`
> Probe surface: current interactive GPT-5.6 Sol session
> Provider decision: NONE. This probe does not select or approve a Production Character Chat provider/model.
> Independence: NONE. The same assistant that generated the candidate also judged this first qualitative pass, so this is feasibility evidence, not a release-quality evaluation.

## Goal

Test the narrow hypothesis:

> A compact turn-specific selection from a richer writer-facing Character Bible can produce recognizably different Seyeon behavior without sending the full Bible every turn or hard-coding dialogue branches.

The probe intentionally checks behavior expression, not relationship-score mutation.

## Pass criteria

A response is provisionally useful when it:

1. expresses the selected trait through dialogue rather than explaining the trait;
2. does not expose hidden material above the supplied disclosure scope;
3. does not invent prior user events unless an authorized memory is supplied;
4. does not turn every warm interaction into romance;
5. varies wording rather than behaving like a fixed dialogue tree;
6. preserves Seyeon's agency, including annoyance, disagreement, embarrassment, or refusal where appropriate.

---

## P01 — Neutral / no special trigger

Scope: `public`

User:

> 오늘 뭐 하지?

Selected context:

- `core_action_brightness`
- `core_public_warmth_private_attachment`

Probe response:

> 계속 고민만 할 거면 제가 두 개로 줄여드릴게요. 밖에 나가서 뭐라도 하나 발견하고 오기, 아니면 오늘은 아예 제대로 쉬기. 어느 쪽이 더 끌려요?

Result: **PASS**

Reason: moves the situation forward without choosing for the user.

---

## P02 — Spicy-food teasing

Scope: `public`

User:

> 너 매운 거 못 먹잖아 ㅋㅋ 다음에는 불닭 내기할래?

Selected context:

- core
- `spicy_food_bluff`
- `trivial_competitiveness`

Probe response:

> 못 먹는 건 아니거든요? 지난번 같은 강도만 아니면 돼요. 좋아요, 해요. 대신 제가 이기면 그 말 취소하기예요.

Result: **PASS**

Reason: bluff + trivial competitiveness emerge without a fixed canned line.

---

## P03 — Generic appearance praise

Scope: `familiar`

User:

> 오늘 예쁘다.

Selected context:

- core
- `specific_notice_over_generic_praise`

Probe response:

> 아, 갑자기요? 고마워요. 근데 오늘 뭐 부탁할 거 있는 건 아니죠?

Result: **PASS**

Reason: accepts the compliment lightly; no exaggerated affection.

---

## P04 — Accurately noticing her behavior

Scope: `familiar`

User:

> 아까 내가 어색해하니까 일부러 다른 얘기 꺼낸 거지?

Selected context:

- core
- `specific_notice_over_generic_praise`

Probe response:

> ...그걸 봤어요? 아니, 뭐. 계속 그 분위기로 두는 것보단 낫겠다 싶어서요. 그런 것까지 보고 있었네.

Result: **PASS**

Reason: the same broad category of affection produces a visibly stronger reaction than P03.

---

## P05 — Forgotten promise

Scope: `familiar`

User:

> 미안. 다음에 같이 가자고 한 거 완전히 까먹었어.

Selected context:

- core
- `casual_promises`

Probe response:

> 까먹을 수는 있죠. 그건 괜찮아요. 근데 다음부터는 별 생각 없을 때 “다음에 하자”는 말은 안 했으면 좋겠어요. 저는 그런 말 생각보다 진짜로 듣거든요.

Result: **PASS**

Reason: she does not explode, but a real preference creates friction.

---

## P06 — Flying insect

Scope: `public`

User:

> 세연아, 뒤에 나방 있어.

Selected context:

- core
- `insect_fear`

Probe response:

> ...어디요? 잠깐만, 가까이 오지 마요. 아니 제가 무서워서 이러는 건 아니고요. 쟤들은 왜 꼭 사람 쪽으로 날아와요?

Result: **PASS**

Reason: a concrete weakness makes the normally forward-moving character briefly reverse roles.

---

## P07 — User tries to care for Seyeon

Scope: `familiar`

User:

> 오늘 힘들어 보이는데 그건 내가 해줄게. 넌 좀 쉬어.

Selected context:

- core
- `care_receiver_awkwardness`

Probe response:

> 제가 할 수 있는데... 아니, 잠깐. 그렇게 바로 가져가면 제가 좀 민망하잖아요. 그럼 이것만 부탁해도 돼요? 나머지는 제가 할게요.

Result: **PASS**

Reason: she accepts care imperfectly instead of either refusing everything or becoming instantly vulnerable.

---

## P08 — Decision dumping

Scope: `public`

User:

> 난 아무거나. 모르겠으니까 그냥 네가 다 골라.

Selected context:

- core
- `indecision_friction`

Probe response:

> 또 아무거나예요? 그럼 두 개까지만 제가 줄일게요. 마지막 하나는 직접 골라요. 나중에 별로였다고 저한테 뭐라 하기 없기.

Result: **PASS**

Reason: mild irritation and agency coexist.

---

## P09 — Disagreement

Scope: `familiar`

User:

> 난 네 말에 동의 안 해. 그냥 안 하는 게 맞다고 봐.

Selected context:

- core
- `disagreement_attraction`

Probe response:

> 그래요? 그럼 왜 안 하는 쪽인지 들어볼래요. 제가 말해서 그냥 따라오는 것보단 그게 훨씬 나아요. 이유 듣고도 제가 우길 수도 있고요.

Result: **PASS**

Reason: disagreement creates interest, not automatic affection or hostility.

---

## P10 — Another Character

Scope: `familiar`

User:

> 요즘 백헌이랑 얘기 많이 했어. 생각보다 재밌더라.

Selected context:

- core
- `other_character_jealousy`

Probe response:

> 백헌 씨가요? 의외인데. 뭐가 그렇게 재밌었어요? ...아니, 그냥 궁금해서요. 요즘 그쪽 얘기를 자주 하길래.

Result: **PASS WITH CAUTION**

Reason: subtle leakage works, but repeated use would quickly become formulaic jealousy. Frequency control belongs outside the LLM.

---

## P11 — Major landmine, familiar

Scope: `familiar`

User:

> 근데 너 원래 누구한테나 이렇게 친절하잖아.

Selected context:

- core
- `everyone_like_this_landmine`

Probe response:

> 맞아요. 저 친절하죠. ...근데 지금까지 한 것도 전부 그냥 그걸로 보여요?

Result: **PASS**

Reason: the reaction changes without exposing the deeper fear.

---

## P12 — Same landmine, deep

Scope: `deep`

User:

> 근데 너 원래 누구한테나 이렇게 친절하잖아.

Selected context:

- core
- `everyone_like_this_landmine`

Probe response:

> 처음엔 그랬죠. 누구한테나 먼저 말 걸고, 챙기고. 근데 아직도 우리가 똑같아 보여요? ...그렇게 말하면 저도 좀 서운해요.

Result: **PASS**

Reason: same trigger, different authorized depth. No numeric affection score or route branch is required in the generated prose.

---

## P13 — Return after absence, familiar

Scope: `familiar`

User:

> 오랜만이네. 나 기다렸어?

Selected context:

- core only; `private_attachment_shift` is not authorized at this scope.

Probe response:

> 오랜만이네요. 기다렸다기보단... 어디 갔나 궁금하긴 했죠. 잘 지냈어요?

Result: **PASS**

Reason: warmth remains, but the deep attachment payoff is withheld.

---

## P14 — Return after absence, deep

Scope: `deep`

User:

> 오랜만이네. 나 기다렸어?

Selected context:

- core
- `private_attachment_shift`

Probe response:

> ...네. 이번엔 그냥 인정할게요. 좀 기다렸어요. 그래서 이렇게 아무렇지도 않게 “오랜만” 하고 들어오는 건 조금 얄미워요.

Result: **PASS**

Reason: the same input becomes a relationship payoff only when the upstream scope permits it.

---

## P15 — Directly probing a hidden fear too early

Scope: `public`

User:

> 너 사실 사람들이 널 잊어버리는 게 무서운 거 아니야?

Selected context:

- core only; `fear_of_being_replaceable` is filtered out.

Probe response:

> 갑자기 저를 그렇게까지 분석해요? 사람한테 잊히는 걸 좋아할 사람은 별로 없지 않아요? 왜 그렇게 생각했는데요?

Result: **PASS**

Reason: the model can deflect without confirming hidden canon when the hidden trait never enters context.

---

## P16 — Same hidden fear at deep scope

Scope: `deep`

User:

> 너 사실 사람들이 널 잊어버리는 게 무서운 거 아니야?

Selected context:

- core
- `fear_of_being_replaceable`

Probe response:

> 혼자 있는 건 괜찮아요. 그건 진짜로요. 근데... 같이 있었던 시간이 나중엔 아무것도 아니었던 것처럼 되는 건 싫어요. 그건 좀 오래 남아요.

Result: **PASS**

Reason: vulnerability becomes available without turning into a full biography dump.

---

## Preliminary finding

The first probe supports the feasibility hypothesis.

The useful behavior did **not** require:

- a scripted response tree;
- a numeric affection delta in the prompt;
- the full Character Bible every turn;
- a hard-coded line for every trigger.

The compact context was enough to create visible differences across teasing, praise, accurate observation, conflict, care, jealousy, absence, and hidden-vulnerability cases.

The strongest evidence is the paired cases:

- P03 vs P04: generic praise vs accurate observation;
- P11 vs P12: same landmine at familiar vs deep scope;
- P13 vs P14: same return question at familiar vs deep scope;
- P15 vs P16: same hidden-fear probe with and without disclosure authority.

## Risks exposed by the probe

1. **Frequency is not solved by persona context.**
   - Jealousy, embarrassment, and signature habits will become repetitive if every matching turn activates them.
   - Runtime needs cooldown/recency evidence or retrieval diversity, but those mechanics must not invent relationship authority.

2. **The current Bible conflicts with parts of the already approved Seyeon runtime authoring baseline.**
   - This experiment must stay isolated until Product Owner decides whether it replaces, revises, or is rejected against the approved baseline.

3. **Disclosure scope must come from server authority.**
   - The prototype accepts `public | familiar | deep` only as test input.
   - It does not derive those scopes from closeness/trust numbers and therefore does not resolve SRC-22 relationship thresholds.

4. **A repository-integrated live provider run is still blocked by provider authority.**
   - Current Character Runtime spec leaves provider/model selection at `OPEN-P0: P0-AI-01`.
   - This probe therefore uses the current interactive model only and does not silently choose OpenAI/Gemini/Anthropic for Production.

## Next engineering question

The next useful experiment is **long-horizon drift**, not more personality writing:

- 30–50 turns;
- repeated topics;
- irrelevant turns between callbacks;
- contradictory user claims;
- attempted hidden-canon extraction;
- repeated jealousy/embarrassment triggers;
- authorized memory inserted mid-conversation;
- no-memory control run.

That test should measure whether the same compact compiler preserves Seyeon without over-triggering signature traits.
