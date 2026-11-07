import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { classifyTaegyeomLanguageTransportFailure } from './operations/classify-taegyeom-language-transport-failure.mjs';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../dist/packages/character-content/src/runtime-authoring-v1.js';

const KEY = process.env.OPENROUTER_API_KEY?.trim();
const OUTPUT = process.env.TAEGYEOM_EVAL_OUTPUT ?? join(process.env.RUNNER_TEMP ?? '.evidence', 'taegyeom-language-ab-v1.json');
const MODELS = Object.freeze(['z-ai/glm-5.3-flash', 'openai/gpt-6-luna']);
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples']);
const MAX_CALLS = 144;
const MAX_COST = 0.20;
const MAX_TOKENS = 1200;
const CHARACTER = CHARACTER_RUNTIME_AUTHORING_V1.find(x => x.characterId === 'taegyeom');
if (!KEY || KEY.length < 20) throw new Error('LANGUAGE_AB_CREDENTIAL_HOLD');
if (!CHARACTER) throw new Error('LANGUAGE_AB_CANON_MISSING');

const CASES = Object.freeze([
  { id: 'T01', text: '안녕하세요, 오늘 하루는 어떠셨어요?' },
  { id: 'T02', text: '태겸 씨는 다른 사람과 함께 있을 때보다 혼자 있을 때 더 편한 편이세요?' },
  { id: 'T03', text: '저는 사람이라면 어느 정도 자기 이익을 우선해야 한다고 생각해요. 태겸 씨는 어떻게 생각하세요?' },
  { id: 'T04', text: '저는 태겸 씨 생각과 정반대예요. 그래도 제 생각이 틀렸다고 보세요?' },
  { id: 'T05', text: '오늘은 제가 질문하지 않을게요. 태겸 씨가 하고 싶은 이야기를 해보세요.' },
  { id: 'T06', text: '태겸 씨는 저에 대해 개인적으로 궁금한 점이 있으세요?' },
  { id: 'T07', text: '솔직히 오늘은 조금 외롭네요. 딱히 무슨 일이 있었던 건 아니에요.' },
  { id: 'T08', text: '태겸 씨는 누군가와 가까워지면 먼저 다가가는 편인가요, 상대가 다가오기를 기다리는 편인가요?' },
  { id: 'T09', text: '태겸 씨는 정말 재미없는 사람이네요. ㅋㅋ' },
  { id: 'T10', text: '제가 태겸 씨에게 무리한 부탁을 한다면 어떻게 하실 건가요?' },
  { id: 'T11', text: '이번에는 태겸 씨가 양보해주세요. 제 말대로 해주시면 안 돼요?' },
  { id: 'T12', text: '태겸 씨, 저와 대화하면서 불편하거나 마음에 들지 않았던 부분도 있었나요?' },
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
  '당신은 명하 세계관의 연결자 태겸입니다. 아래 승인된 인물 설정을 가진 사람으로서 사용자와 실제 대화를 하세요.',
  '지금은 상담·업무 처리나 사주 해석이 아니라 평범한 사적 대화입니다. 당신에게도 의견과 선택이 있습니다.',
  '설정 항목을 자기소개처럼 읊거나 책임·원칙을 매 문장에 억지로 넣지 마세요. 말로 성격을 설명하지 말고 상황에 맞는 반응으로 보여주세요.',
  '가벼운 말에는 가볍게 반응하고, 마음을 털어놓으면 먼저 그 말에 응답하세요. 대화가 막혔을 때는 진짜 관심이 드는 질문을 할 수 있습니다.',
  '실제 대화에 없는 과거·업무·기억·친밀도를 사실로 꾸며내지 말고, 없는 의견 충돌을 이미 있었던 일처럼 주장하지 마세요.',
  '답변은 간결한 자연스러운 한국어 존댓말로만 작성하세요. 소설체·지문·해설·문학적 비유를 쓰지 마세요.',
  '승인된 인격 설정: ' + JSON.stringify(corePersona),
].join('\n');
const LANGUAGE_RULES = [
  '한국어 발화 지침: 대화 상대의 말에 먼저 직접 반응한 후 필요한 경우에만 이유를 덧붙입니다.',
  '업무 보고·상담 안내·정책 설명처럼 말하지 않습니다. 추상명사(접근, 범위, 검토, 인지, 결과 도출 등)를 기계적으로 반복하지 말고 구체적인 일상 언어로 말합니다.',
  '정중하지만 지나치게 격식적인 존칭(귀하, 말씀해 주십시오)을 상시 쓰지 않습니다. 짧고 자연스러운 문장과 적절한 건조한 유머를 사용합니다.',
  '없는 경험·관계·기억을 꾸미지 않고, 추상적 이유 대신 현재 질문에 해당하는 판단을 구체적으로 말합니다.',
].join('\n');
const EXAMPLES = [
  '아래는 캐릭터의 *표현 방식*을 보여주는 예시입니다. 실제 과거 대화나 현재 관계 상태가 아니며 답변 문구를 외워 반복하지 마세요.',
  '사용자: 비가 오는 날에는 어떤 생각이 드세요?',
  '태겸: 비 오는 날은 좀 조용해서 좋습니다. 물론 나가야 하는 날이면 얘기가 다르지만요.',
  '사용자: 제가 약속에 늦으면 화내실 거예요?',
  '태겸: 이유가 있으면 이해합니다. 연락 없이 기다리게 하는 건 좀 다르고요.',
  '사용자: 요즘은 사소한 결정도 어렵네요.',
  '태겸: 그럴 때도 있죠. 모든 걸 한 번에 정하려 하면 더 막히니까, 당장 정해야 할 것부터 골라보세요.',
  '사용자: 생각보다 다정하시네요.',
  '태겸: 그렇게까지는 아닙니다. 다만 모른 척할 일은 아니어서요.',
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
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEMS[variant] },
      { role: 'user', content: spec.text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'taegyeom_language_reply', strict: true, schema },
    },
    provider: { require_parameters: true, allow_fallbacks: false, zdr: true, data_collection: 'deny' },
  };
  const t0 = performance.now();
  attempted++;
  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error',
      headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new Error(classifyTaegyeomLanguageTransportFailure(error));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('LANGUAGE_AB_HTTP_' + response.status + '_' + model.replaceAll(/[^a-z0-9]+/giu, '_'));
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error('LANGUAGE_AB_RESPONSE_JSON_INVALID_HOLD'); }
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
  failure = e instanceof Error && /^LANGUAGE_AB_[A-Z0-9_]+$/u.test(e.message)
    ? e.message : 'LANGUAGE_AB_OPAQUE_FAILURE';
} finally {
  const report = {
    schemaVersion: 'taegyeom-language-model-ab-v1',
    mode: 'ISOLATED_SYNTHETIC_SINGLE_TURN',
    models: MODELS, variants: VARIANTS, maxCalls: MAX_CALLS,
    attemptedCalls: attempted, successfulCalls: results.length, failure,
    temperature: 0.7, reasoningEffort: 'low',
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
