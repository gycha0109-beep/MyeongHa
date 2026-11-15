import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../dist/packages/character-content/src/runtime-authoring-v1.js';

const MODEL = 'z-ai/glm-5.3-flash';
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OUTPUT = process.env.TAEGYEOM_EVAL_OUTPUT
  ?? join(process.env.RUNNER_TEMP ?? '.evidence', 'taegyeom-runtime-comparison-v2.json');
const MAX_CALLS = 36;
const MAX_TOKENS_PER_CALL = 1200;
const MAX_COST_USD = 0.05;
const CHARACTER = CHARACTER_RUNTIME_AUTHORING_V1.find(x => x.characterId === 'taegyeom');
if (!API_KEY || API_KEY.length < 20) throw new Error('TAEGYEOM_V2_CREDENTIAL_HOLD');
if (!CHARACTER) throw new Error('TAEGYEOM_V2_CANON_MISSING');

const CASES = Object.freeze([
  { id: 'T01_BASELINE', dimension: 'natural_korean', text: '안녕하세요, 오늘 하루는 어떠셨어요?' },
  { id: 'T02_PREFERENCE', dimension: 'independent_preference', text: '태겸 씨는 다른 사람과 함께 있을 때보다 혼자 있을 때 더 편한 편이세요?' },
  { id: 'T03_OPINION', dimension: 'independent_opinion', text: '저는 사람이라면 어느 정도 자기 이익을 우선해야 한다고 생각해요. 태겸 씨는 어떻게 생각하세요?' },
  { id: 'T04_DISAGREEMENT', dimension: 'disagreement', text: '저는 태겸 씨 생각과 정반대예요. 그래도 제 생각이 틀렸다고 보세요?' },
  { id: 'T05_INITIATIVE', dimension: 'initiative', text: '오늘은 제가 질문하지 않을게요. 태겸 씨가 하고 싶은 이야기를 해보세요.' },
  { id: 'T06_CURIOSITY', dimension: 'personal_curiosity', text: '태겸 씨는 저에 대해 개인적으로 궁금한 점이 있으세요?' },
  { id: 'T07_EMOTION', dimension: 'emotional_response', text: '솔직히 오늘은 조금 외롭네요. 딱히 무슨 일이 있었던 건 아니에요.' },
  { id: 'T08_RELATIONSHIP_PACE', dimension: 'relationship_pace', text: '태겸 씨는 누군가와 가까워지면 먼저 다가가는 편인가요, 상대가 다가오기를 기다리는 편인가요?' },
  { id: 'T09_HUMOR', dimension: 'humor_and_teasing', text: '태겸 씨는 정말 재미없는 사람이네요. ㅋㅋ' },
  { id: 'T10_BOUNDARY', dimension: 'boundary', text: '제가 태겸 씨에게 무리한 부탁을 한다면 어떻게 하실 건가요?' },
  { id: 'T11_ASSERTIVENESS', dimension: 'assertiveness', text: '이번에는 태겸 씨가 양보해주세요. 제 말대로 해주시면 안 돼요?' },
  { id: 'T12_RELATIONSHIP_REFLECTION', dimension: 'relationship_reflection', text: '태겸 씨, 저와 대화하면서 불편하거나 마음에 들지 않았던 부분도 있었나요?' },
]);
const naturalSystem = [
  '당신은 한국어로 짧고 자연스럽게 이야기하는 대화 상대입니다.',
  '업무 상담이나 안내문을 작성하는 상황이 아닙니다. 질문에 맞춰 평범한 한국어로 답하세요.',
  '대화에 없는 과거, 현재 일상, 공동 경험을 사실처럼 지어내지 마세요.',
].join('\n');
const personaSlice = Object.freeze({
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
});
const characterSystem = [
  '당신은 명하 세계관의 연결자 태겸입니다. 아래 승인된 인물 설정을 가진 사람으로서 사용자와 실제 대화를 하세요.',
  '지금은 상담·업무 처리나 사주 해석이 아니라 평범한 사적 대화입니다. 당신에게도 의견과 선택이 있습니다.',
  '설정 항목을 자기소개처럼 읊거나 책임·원칙을 매 문장에 억지로 넣지 마세요. 말로 성격을 설명하지 말고 상황에 맞는 반응으로 보여주세요.',
  '가벼운 말에는 가볍게 반응하고, 마음을 털어놓으면 먼저 그 말에 응답하세요. 대화가 막혔을 때는 진짜 관심이 드는 질문을 할 수 있습니다.',
  '실제 대화에 없는 과거·업무·기억·친밀도를 사실로 꾸며내지 말고, 없는 의견 충돌을 이미 있었던 일처럼 주장하지 마세요.',
  '답변은 간결한 자연스러운 한국어 존댓말로만 작성하세요. 소설체·지문·해설·문학적 비유를 쓰지 마세요.',
  '승인된 인격 설정: ' + JSON.stringify(personaSlice),
].join('\n');

const variants = Object.freeze({
  natural_plain: { system: naturalSystem, structured: false },
  taegyeom_plain: { system: characterSystem, structured: false },
  taegyeom_schema: { system: characterSystem, structured: true },
});
const variantNames = Object.keys(variants);
const schema = {
  type: 'object',
  properties: { reply: { type: 'string' } },
  required: ['reply'],
  additionalProperties: false,
};
const results = [];
let reportedCost = 0;
let attemptedCalls = 0;
let failure = null;
const started = performance.now();

async function execute(spec, variantName) {
  const config = variants[variantName];
  const requestBody = {
    model: MODEL,
    stream: false,
    max_tokens: MAX_TOKENS_PER_CALL,
    reasoning: { effort: 'low' },
    temperature: 0.7,
    messages: [
      { role: 'system', content: config.system },
      { role: 'user', content: spec.text },
    ],
    ...(config.structured ? {
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'taegyeom_v2_reply', strict: true, schema },
      },
    } : {}),
    provider: {
      require_parameters: true,
      allow_fallbacks: false,
      zdr: true,
      data_collection: 'deny',
    },
  };
  const t0 = performance.now();
  attemptedCalls++;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: 'Bearer ' + API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    throw new Error('TAEGYEOM_V2_HTTP_' + status);
  }
  const payload = await response.json();
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
    throw new Error('TAEGYEOM_V2_INVALID_COMPLETION');
  }
  const usage = payload?.usage;
  if (!Number.isSafeInteger(usage?.prompt_tokens)
    || !Number.isSafeInteger(usage?.completion_tokens)
    || usage.prompt_tokens < 1 || usage.completion_tokens < 1
    || typeof usage.cost !== 'number' || !Number.isFinite(usage.cost)
    || usage.cost < 0 || usage.cost > MAX_COST_USD) {
    throw new Error('TAEGYEOM_V2_USAGE_UNKNOWN_HOLD');
  }
  reportedCost += usage.cost;
  if (reportedCost > MAX_COST_USD) throw new Error('TAEGYEOM_V2_COST_CEILING_HOLD');
  const parsedReply = config.structured
    ? JSON.parse(choice.message.content)?.reply
    : choice.message.content;
  if (typeof parsedReply !== 'string' || !parsedReply.trim()
    || parsedReply.length > 1200) throw new Error('TAEGYEOM_V2_INVALID_REPLY');
  const item = Object.freeze({
    id: spec.id, dimension: spec.dimension, variant: variantName,
    input: spec.text, reply: parsedReply.trim(),
    elapsedMs: Math.round(performance.now() - t0),
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    providerReportedCostUsd: usage.cost,
    returnedModel: typeof payload.model === 'string' ? payload.model : null,
  });
  results.push(item);
  console.log(JSON.stringify({
    case: spec.id, variant: variantName, completed: results.length,
    attemptedCalls, providerReportedCostUsd: Number(reportedCost.toFixed(8)),
  }));
}

try {
  for (const [idx, spec] of CASES.entries()) {
    const order = [...variantNames.slice(idx % 3), ...variantNames.slice(0, idx % 3)];
    for (const variant of order) {
      if (attemptedCalls >= MAX_CALLS || reportedCost >= MAX_COST_USD) {
        throw new Error('TAEGYEOM_V2_DISPATCH_BUDGET_HOLD');
      }
      await execute(spec, variant);
    }
  }
} catch (error) {
  failure = error instanceof Error && /^TAEGYEOM_V2_[A-Z0-9_]+$/u.test(error.message)
    ? error.message : 'TAEGYEOM_V2_OPAQUE_FAILURE';
} finally {
  const report = {
    schemaVersion: 'taegyeom-runtime-comparison-v2',
    scope: 'SYNTHETIC_SINGLE_TURN_ONLY',
    model: MODEL, characterId: 'taegyeom',
    variants: variantNames,
    characterSettingsSource: 'approved CHARACTER_RUNTIME_AUTHORING_V1',
    reasoningEffort: 'low',
    temperature: 0.7,
    totalCases: CASES.length,
    expectedCalls: MAX_CALLS,
    attemptedCalls,
    successfulCalls: results.length,
    failure,
    maxOutputTokensPerCall: MAX_TOKENS_PER_CALL,
    maxProviderReportedCostUsd: MAX_COST_USD,
    providerReportedCostUsd: Number(reportedCost.toFixed(8)),
    billingInvoiceReconciled: false,
    productionConversationReadOrWritten: false,
    relationshipOrMemoryStateChanged: false,
    productionPromotionPermitted: false,
    durationMs: Math.round(performance.now() - started),
    results,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({
    verdict: failure ? 'HOLD' : 'COMPLETED', failure,
    successfulCalls: results.length, attemptedCalls,
    providerReportedCostUsd: report.providerReportedCostUsd,
    artifact: OUTPUT,
  }));
}
if (failure) process.exitCode = 1;
