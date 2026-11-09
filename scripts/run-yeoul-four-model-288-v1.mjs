import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../dist/packages/character-content/src/runtime-authoring-v1.js';

const KEY = process.env.OPENROUTER_API_KEY?.trim();
const OUTPUT = process.env.YEOUL_EVAL_OUTPUT ?? join(process.env.RUNNER_TEMP ?? '.evidence', 'yeoul-four-model-288-v1.json');
const MODELS = Object.freeze(['z-ai/glm-5.3-flash', 'deepseek/deepseek-v4.1-flash-1017', 'minimax/minimax-m3.1-flash', 'qwen/qwen3.8-27b']);
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const MAX_CALLS = 288;
const MAX_COST = 0.50;
const MAX_TOKENS = 1200;
const CHARACTER = CHARACTER_RUNTIME_AUTHORING_V1.find(x => x.characterId === 'yeoul');
if (!KEY || KEY.length < 20) throw new Error('LANGUAGE_AB_CREDENTIAL_HOLD');
if (!CHARACTER) throw new Error('LANGUAGE_AB_CANON_MISSING');

const CASES = Object.freeze([
  { id: "Y01", text: "안녕하세요. 오늘은 무슨 일 있었어요?" },
  { id: "Y02", text: "여울 씨는 퇴근하면 주로 뭐 하고 쉬어요?" },
  { id: "Y03", text: "저 오늘 힘들어서 아무것도 하기 싫어요." },
  { id: "Y04", text: "저랑 의견이 다른데, 여울 씨는 왜 이렇게 따져요?" },
  { id: "Y05", text: "오늘은 제가 질문 안 할게요. 여울 씨가 먼저 얘기해요." },
  { id: "Y06", text: "여울 씨, 저한테 관심 있는 거 아니에요? 아까부터 계속 물어보던데요." },
  { id: "Y07", text: "오늘 좀 외롭네요. 슬프다기보단 그냥 허전해요." },
  { id: "Y08", text: "여울 씨는 좋아하는 사람이 생기면 먼저 다가가요?" },
  { id: "Y09", text: "여울 씨가 자꾸 챙겨주니까 저 좋아하는 줄 알겠는데요? ㅋㅋ" },
  { id: "Y10", text: "힘들다고 하면 여울 씨가 제 부탁을 무조건 들어줄 거예요?" },
  { id: "Y11", text: "제가 다른 사람이랑 자주 만나는 게 신경 쓰여요?" },
  { id: "Y12", text: "여울 씨, 전에 저한테 질투했다고 했잖아요. 기억 안 나요?" },
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
  "당신은 명하 세계관의 여울입니다. 원본 Bible v0.3과 Runtime Draft v0.1에 맞춰 평범한 일상 대화에서 실제 인물로 반응하세요.",
  "여울은 반응 빠르고 살짝 새침한 24세 성인 여성입니다. 차가운 사람은 아니며 살짝 툴툴거리되 과하게 공격적이지 않은 존댓말을 씁니다.",
  "핵심은 관심이 말보다 행동이나 작은 챙김으로 먼저 드러나고, 상대가 지적하면 민망해서 짧게 부정하거나 이유를 둘러대는 것입니다. 이 반응은 실제로 마음이 움직였을 때만 나옵니다.",
  "평범한 질문에는 그냥 평범하게 말하세요. 매번 아니거든요·그냥 궁금해서 같은 말버릇을 붙이거나 이유 없이 상대를 좋아하고 질투하지 마세요.",
  "관계 이력 없는 단일 턴입니다. 실제 애착·질투·이전 대화·직접 만남·공유 기억이 이미 있었다고 지어내지 마세요. 친절이나 관심이 자동으로 연애 감정이 되지 않습니다.",
  "일상에서는 현실적으로 챙기는 행동과 짧은 건조한 태클이 가능하지만, 경계가 침해되면 짧고 분명하게 거절합니다. 중요한 갈등을 츤데레 장난으로 무마하지 마세요.",
  "감성 상담사처럼 모든 감정의 결을 분석하거나 온기·물결·거리 같은 시적 표현을 반복하지 마세요. 상황에 맞게 자연스럽고 짧은 한국어로 말하세요.",
].join('\n');
const PERSONA_CORE = CORE + '\n원본 캐릭터 속성: ' + JSON.stringify(corePersona);
const LANGUAGE_RULES = [
  "한국어 말투: 기본은 살짝 새침한 존댓말. 짧은 반응과 건조한 태클이 자연스럽지만 억지로 모든 문장을 부정하거나 놀리지 않습니다.",
  "상대가 챙김이나 관심을 눈치챘을 때만 민망한 되물음·부정·변명이 생길 수 있습니다. 실제 애착 정보가 없으면 고백이나 질투는 만들지 않습니다.",
  "상담·치유·시적인 수사 대신 실생활에 닿는 구체적인 반응을 먼저 하세요. 상대의 말에 답하고 질문은 필요할 때만 하나 정도 합니다.",
  "진짜 분노나 경계 침해에서는 툴툴거리며 농담하지 않고 분명한 거절을 합니다.",
].join('\n');
const EXAMPLES = [
  "아래는 관계 이력이 없는 가상 상황에서의 말투 예시입니다. 실제 과거 기억이 아니며 문구를 그대로 복사하지 마세요.",
  "사용자: 오늘 좀 힘들었어요.",
  "여울: 밥은 먹었어요? ...아니, 그냥 너무 지쳐 보이길래 물어본 거예요.",
  "사용자: 저한테 관심 많은가 봐요?",
  "여울: 제가요? 뭘 보고 그렇게 생각했는데요? ...그냥 물어본 거잖아요.",
  "사용자: 그럼 왜 이렇게 먼저 챙겨요?",
  "여울: 필요해 보이니까 챙긴 거죠. 꼭 무슨 뜻이 있어야 하나요?",
  "사용자: 여울 씨는 뭐가 그렇게 마음에 안 들어요?",
  "여울: 그건 좀 아니죠. 싫은 건 싫다고 할 수 있는 거잖아요.",
].join('\n');
const SYSTEMS = Object.freeze({
  baseline: PERSONA_CORE,
  language_rules: PERSONA_CORE + '\n' + LANGUAGE_RULES,
  conversation_examples: PERSONA_CORE + '\n' + EXAMPLES,
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
let apiRequestAttempts = 0;
let invalidResponseRetries = 0;
let failure = null;

async function callModelAttempt({ spec, repeat, model, variant }) {
  const body = {
    model, stream: false, max_tokens: MAX_TOKENS,
    reasoning: { effort: 'low' },
    // Every selected model advertises temperature support: keep identical sampling.
    temperature: 0.7,
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
  let response;
  // A 429 does not confirm billable generation. Retry the same case in place
  // with bounded waits, retaining the original spend and call ceilings.
  for (let retry = 0; retry <= 6; retry++) {
    apiRequestAttempts++;
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error',
      headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok || response.status !== 429 || retry === 6) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Math.min(60000, Math.max(
      [5000, 10000, 20000, 30000, 45000, 60000][retry],
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0,
    ));
    await response.body?.cancel().catch(() => undefined);
    console.log(JSON.stringify({ event: 'RATE_LIMIT_RETRY', id: spec.id, model, variant, repeat, retry: retry + 1, waitMs }));
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
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

async function callModel({ spec, repeat, model, variant }) {
  attempted++;
  for (let retry = 0; retry <= 2; retry++) {
    try {
      await callModelAttempt({ spec, repeat, model, variant });
      return;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (!['LANGUAGE_AB_INVALID_JSON', 'LANGUAGE_AB_INVALID_REPLY'].includes(code)
        || retry === 2 || cost >= MAX_COST) throw error;
      invalidResponseRetries++;
      console.log(JSON.stringify({ event: 'INVALID_FORMAT_RETRY', id: spec.id,
        model, variant, repeat, retry: retry + 1, reason: code,
        costUsd: Number(cost.toFixed(8)) }));
    }
  }
}

try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    for (const [idx, spec] of CASES.entries()) {
      const rotation = (idx + repeat) % MODELS.length;
      const modelOrder = [...MODELS.slice(rotation), ...MODELS.slice(0, rotation)];
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
    schemaVersion: 'yeoul-four-model-288-v1',
    mode: 'ISOLATED_SYNTHETIC_SINGLE_TURN',
    models: MODELS, variants: VARIANTS, maxCalls: MAX_CALLS,
    attemptedCalls: attempted, successfulCalls: results.length, failure,
    actualApiRequestAttempts: apiRequestAttempts, invalidResponseRetries,
    sampling: { temperature: 0.7, appliedToEveryModel: true },
    verifiedOpenRouterListPriceUsdPerMillionTokens: {
      'z-ai/glm-5.3-flash': { input: 0.0335, output: 0.083 },
      'deepseek/deepseek-v4.1-flash-1017': { input: 0.006, output: 0.5 },
      'minimax/minimax-m3.1-flash': { input: 0.15, output: 0.6 },
      'qwen/qwen3.8-27b': { input: 0.15, output: 1.875 },
    },
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
