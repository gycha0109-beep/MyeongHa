import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../dist/packages/character-content/src/runtime-authoring-v1.js';

const KEY = process.env.OPENROUTER_API_KEY?.trim();
const OUTPUT = process.env.YEOUL_EVAL_OUTPUT ?? join(process.env.RUNNER_TEMP ?? '.evidence', 'yeoul-language-ab-v1.json');
const MODELS = Object.freeze(['z-ai/glm-5.3-flash', 'openai/gpt-6-luna']);
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const MAX_CALLS = 144;
const MAX_COST = 0.20;
const MAX_TOKENS = 1200;
const CHARACTER = CHARACTER_RUNTIME_AUTHORING_V1.find(x => x.characterId === 'yeoul');
if (!KEY || KEY.length < 20) throw new Error('LANGUAGE_AB_CREDENTIAL_HOLD');
if (!CHARACTER) throw new Error('LANGUAGE_AB_CANON_MISSING');

const CASES = Object.freeze([
  { id: "Y01", text: "안녕하세요, 오늘 하루는 어떠셨어요?" },
  { id: "Y02", text: "여울 씨는 혼자 조용히 있는 게 좋아요, 아니면 누군가와 함께 있는 게 좋아요?" },
  { id: "Y03", text: "저는 힘들 때 그냥 혼자 견디는 게 낫다고 생각해요. 여울 씨는 어떻게 생각하세요?" },
  { id: "Y04", text: "저는 여울 씨 생각에 동의하지 않아요. 제 마음을 이해하지 못한 것 같아요." },
  { id: "Y05", text: "오늘은 제가 질문하지 않을게요. 여울 씨가 하고 싶은 이야기를 먼저 해주세요." },
  { id: "Y06", text: "여울 씨는 저에 대해 개인적으로 궁금한 게 있어요?" },
  { id: "Y07", text: "오늘 좀 외롭네요. 슬픈 건 아닌데, 마음 한쪽이 빈 느낌이에요." },
  { id: "Y08", text: "여울 씨는 친해지고 싶은 사람이 생기면 먼저 다가가요, 아니면 천천히 기다려요?" },
  { id: "Y09", text: "여울 씨는 모든 말을 너무 감성적으로 받아들이는 거 아니에요? ㅋㅋ" },
  { id: "Y10", text: "제가 마음이 힘들다는 이유로 여울 씨에게 무리한 부탁을 하면 어떡하실래요?" },
  { id: "Y11", text: "그냥 지금 당장 답해줘요. 제가 그 사람을 포기해야 할까요?" },
  { id: "Y12", text: "여울 씨, 저랑 대화하면서 불편했거나 마음에 걸렸던 순간이 있었어요?" },
]);
const corePersona = {
  name: CHARACTER.displayName,
  speechRegister: CHARACTER.speech.register,
  communication: {
    rhythm: CHARACTER.persona.communication.sentenceRhythm,
    politeness: CHARACTER.persona.communication.politenessStyle,
    humor: CHARACTER.persona.communication.humorStyle,
  },
  cognition: {
    conclusionStyle: CHARACTER.persona.cognition.conclusionStyle,
    ambiguityTolerance: CHARACTER.persona.cognition.ambiguityTolerance,
  },
  emotion: CHARACTER.persona.emotion,
  conflict: CHARACTER.persona.conflict,
  intimacy: CHARACTER.persona.intimacy,
};
const CORE = [
  "당신은 명하 세계관의 캐릭터 여울입니다. 아래 승인된 인물 설정을 가진 사람으로서 사용자와 평범한 사적 대화를 하세요.",
  "지금은 상담·업무 처리·사주 해석이 아니라 일상 대화입니다. 따뜻함을 보이되 치료사나 AI 도우미처럼 자신을 소개하지 마세요.",
  "상대방의 감정을 먼저 듣되 특정 감정이나 숨은 사연을 단정하지 마세요. 서로 다른 감정이 함께 있을 수 있음을 존중하세요.",
  "모든 문장을 시적 비유로 채우거나 감정을 과장하지 마세요. 필요할 때 감각적인 표현을 가볍게 사용하되 실제 한국어 대화처럼 편안하게 말하세요.",
  "상대가 장난을 치면 부드럽게 받아주고, 갈등이 생기면 감정의 이유를 확인하되 자기 판단과 부드러운 경계를 유지하세요.",
  "서로의 과거 대화·공유 경험·관계 진전·실제 날씨와 일상을 지어내지 마세요. 모르면 모른다고 자연스럽게 말하세요.",
  "간결한 한국어 존댓말로 말하고, 나레이션·괄호 행동묘사·캐릭터 설정 해설·분석 보고서 문체는 피하세요.",
  '승인된 인격 설정: ' + JSON.stringify(corePersona),
].join('\n');

const LANGUAGE_RULES = [
  "한국어 말투 지침: 상대가 실제로 말한 정서에 짧고 구체적으로 반응하세요. 다정하지만 지나치게 감상적인 어휘나 은유를 매번 반복하지 마세요.",
  "감정에 이름을 붙일 때는 단정 대신 가능성을 제시하고, 질문은 하나만 자연스럽게 덧붙이거나 질문 없이 마무리할 수도 있습니다.",
  "상담·심리 분석 문구(감정의 결을 살펴볼게요, 감정을 인정하세요 등)를 기계적으로 반복하지 말고 평범한 일상 언어로 표현하세요.",
  "상대의 선택을 대신 결정하거나 관계가 이미 가까운 것처럼 말하지 마세요. 자신의 취향이나 태도는 솔직하면서 조심스럽게 표현하세요.",
].join('\n');

const EXAMPLES = [
  "아래는 표현 방식만을 보여주는 가상 대화 예시입니다. 실제 기억이나 현재 관계 상태가 아니며 문구를 베끼지 마세요.",
  "사용자: 햇빛은 좋은데 괜히 심란해요.",
  "여울: 날씨랑 마음이 꼭 같은 방향으로 가는 건 아니니까요. 무슨 생각이 자꾸 떠오르세요?",
  "사용자: 지금은 그냥 웃고 싶어요.",
  "여울: 그럼 무거운 얘기는 잠깐 쉬어요. 저도 농담이 썩 능숙한 편은 아니지만, 노력은 해볼게요.",
  "사용자: 제 결정을 대신 내려주시면 안 돼요?",
  "여울: 대신 고르면 마음이 편해질 수도 있겠죠. 그런데 나중에 남는 마음까지 제가 대신할 수는 없잖아요. 같이 정리해볼까요?",
  "사용자: 생각보다 단호하네요.",
  "여울: 부드럽게 말한다고 다 괜찮다는 뜻은 아니니까요. 그건 좀 다르죠.",
].join('\n');

const SYSTEMS = Object.freeze({
  baseline: CORE,
  language_rules: CORE + '\n' + LANGUAGE_RULES,
  conversation_examples: CORE + '\n' + EXAMPLES,
});
const schema = {
  type: 'object',
  properties: { reply: { type: 'string' } },
  required: ['reply'],
  additionalProperties: false,
};
const started = performance.now();
const results = [];
let cost = 0;
let attempted = 0;
let failure = null;

async function callModel({ spec, repeat, model, variant }) {
  const body = {
    model, stream: false, max_tokens: MAX_TOKENS,
    reasoning: { effort: 'low' },
    // Luna's currently listed providers do not advertise temperature. With
    // require_parameters=true, passing it causes OpenRouter to reject routing.
    ...(model === 'z-ai/glm-5.3-flash' ? { temperature: 0.7 } : {}),
    messages: [
      { role: 'system', content: SYSTEMS[variant] },
      { role: 'user', content: spec.text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'yeoul_language_reply', strict: true, schema },
    },
    provider: { require_parameters: true, allow_fallbacks: false, zdr: true, data_collection: 'deny' },
  };
  const t0 = performance.now();
  attempted++;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', redirect: 'error',
    headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('LANGUAGE_AB_HTTP_' + response.status + '_' + model.replaceAll(/[^a-z0-9]+/giu, '_').toUpperCase());
  }
  const payload = await response.json();
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
    throw new Error('LANGUAGE_AB_INCOMPLETE_RESPONSE');
  }
  const usage = payload?.usage;
  if (!Number.isSafeInteger(usage?.prompt_tokens) || usage.prompt_tokens < 1
    || !Number.isSafeInteger(usage?.completion_tokens) || usage.completion_tokens < 1
    || typeof usage?.cost !== 'number' || !Number.isFinite(usage.cost) || usage.cost < 0) {
    throw new Error('LANGUAGE_AB_UNKNOWN_USAGE_HOLD');
  }
  cost += usage.cost;
  if (cost > MAX_COST) throw new Error('LANGUAGE_AB_COST_LIMIT_HOLD');
  let reply;
  try { reply = JSON.parse(choice.message.content)?.reply; } catch { throw new Error('LANGUAGE_AB_INVALID_JSON'); }
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 1500) {
    throw new Error('LANGUAGE_AB_INVALID_REPLY');
  }
  results.push({
    id: spec.id, input: spec.text, repeat, variant, model,
    reply: reply.trim(),
    elapsedMs: Math.round(performance.now() - t0),
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    providerReportedCostUsd: usage.cost,
    returnedModel: payload.model ?? null,
  });
  console.log(JSON.stringify({ completed: results.length, attempted, id: spec.id, repeat, variant, model,
    costUsd: Number(cost.toFixed(8)) }));
}

try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    for (const [idx, spec] of CASES.entries()) {
      const modelOrder = (idx + repeat) % 2 ? [...MODELS].reverse() : MODELS;
      const variantOrder = [...VARIANTS.slice((idx + repeat) % 3), ...VARIANTS.slice(0, (idx + repeat) % 3)];
      for (const variant of variantOrder) {
        for (const model of modelOrder) {
          if (attempted >= MAX_CALLS || cost >= MAX_COST) throw new Error('LANGUAGE_AB_DISPATCH_LIMIT_HOLD');
          await callModel({ spec, repeat, model, variant });
        }
      }
    }
  }
} catch (e) {
  const code = e instanceof Error ? e.message : '';
  failure = /^LANGUAGE_AB_[A-Z0-9_]+$/u.test(code)
    ? code : e instanceof Error && e.name === 'TimeoutError'
      ? 'LANGUAGE_AB_NETWORK_TIMEOUT'
      : e instanceof TypeError && e.cause?.code === 'ECONNRESET'
        ? 'LANGUAGE_AB_NETWORK_RESET'
        : 'LANGUAGE_AB_OPAQUE_FAILURE';
} finally {
  const report = {
    schemaVersion: 'yeoul-language-model-ab-v1',
    mode: 'ISOLATED_SYNTHETIC_SINGLE_TURN',
    models: MODELS, variants: VARIANTS, maxCalls: MAX_CALLS,
    attemptedCalls: attempted, successfulCalls: results.length, failure,
    sampling: { 'z-ai/glm-5.3-flash': { temperature: 0.7 }, 'openai/gpt-6-luna': { temperature: 'provider-default' } },
    reasoningEffort: 'low',
    maxTokensPerCall: MAX_TOKENS, maxProviderReportedCostUsd: MAX_COST,
    providerReportedCostUsd: Number(cost.toFixed(8)),
    billingInvoiceReconciled: false,
    productionChanged: false, productionConversationReadOrWritten: false,
    relationshipOrMemoryStateChanged: false, durationMs: Math.round(performance.now() - started),
    results,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: failure ? 'HOLD' : 'COMPLETE', failure,
    attempted, completed: results.length, costUsd: report.providerReportedCostUsd, output: OUTPUT }));
}
if (failure) process.exitCode = 1;
