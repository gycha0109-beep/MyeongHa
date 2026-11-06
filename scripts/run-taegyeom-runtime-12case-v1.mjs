import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from '../dist/packages/character-content/src/runtime-authoring-v1.js';

const MODEL = 'z-ai/glm-5.3-flash';
const MAX_CALLS = 12;
const MAX_OUTPUT_TOKENS = 800;
const MAX_ESTIMATED_COST_USD = 0.25;
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const OUTPUT = process.env.TAEGYEOM_EVAL_OUTPUT
  ?? join(process.env.RUNNER_TEMP ?? '.evidence', 'taegyeom-runtime-12case-v1.json');
const CHARACTER = CHARACTER_RUNTIME_AUTHORING_V1.find((entry) => entry.characterId === 'taegyeom');
if (!API_KEY || API_KEY.length < 20) throw new Error('TAEGYEOM_EVAL_CREDENTIAL_HOLD');
if (!CHARACTER) throw new Error('TAEGYEOM_RUNTIME_AUTHORING_MISSING');

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

const system = [
  '당신은 명하의 연결자 태겸입니다. 사용자의 질문에 자연스러운 한국어 대화로 답하십시오.',
  '아래 승인된 캐릭터 설정은 판단과 반응의 기준입니다. 설정 문구를 답변에서 설명하거나 연기하듯 과시하지 마십시오.',
  '문장은 실제 한국어 화자가 대화에서 쓸 법해야 합니다. 어색한 비유, 소설체 행동 묘사, 자기 행동 해설, 근거 없는 현재 일상이나 기억을 만들지 마십시오.',
  '답변을 매번 교훈·분석·조언으로 만들지 마십시오. 평범한 질문에는 평범하게 답하고, 필요할 때만 짧게 질문하십시오.',
  '사용자에게 무조건 동의하지 마십시오. 근거가 있으면 자신의 의견을 분명히 말하되 모욕하거나 권위적으로 굴지 마십시오.',
  '친밀함을 과장하거나 사용자의 마음을 읽었다고 주장하지 마십시오. 실제 대화에 없는 공동 경험·약속·과거를 만들지 마십시오.',
  '불필요한 서론과 결론을 붙이지 말고, 질문의 핵심에 직접 답하십시오. 기본은 짧고 명료한 존댓말입니다.',
  '',
  '승인된 태겸 설정:',
  JSON.stringify({
    speech: CHARACTER.speech,
    persona: CHARACTER.persona,
    behavior: CHARACTER.behavior,
    relationshipBehavior: CHARACTER.relationshipBehavior,
  }),
].join('\n');

const schema = {
  type: 'object',
  properties: { reply: { type: 'string', minLength: 1, maxLength: 1800 } },
  required: ['reply'],
  additionalProperties: false,
};
const results = [];
let estimatedCostUsd = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
const started = performance.now();

for (const spec of CASES) {
  if (results.length >= MAX_CALLS || estimatedCostUsd >= MAX_ESTIMATED_COST_USD) {
    throw new Error('TAEGYEOM_EVAL_BUDGET_HOLD');
  }
  const t0 = performance.now();
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: 'Bearer ' + API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: spec.text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'taegyeom_dialogue_reply', strict: true, schema },
      },
      provider: {
        require_parameters: true,
        allow_fallbacks: false,
        zdr: true,
        data_collection: 'deny',
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const status = response.status;
    await response.body?.cancel().catch(() => undefined);
    throw new Error('TAEGYEOM_EVAL_HTTP_' + status);
  }
  const payload = await response.json();
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || typeof choice?.message?.content !== 'string') {
    throw new Error('TAEGYEOM_EVAL_INVALID_COMPLETION');
  }
  const parsed = JSON.parse(choice.message.content);
  if (typeof parsed?.reply !== 'string' || !parsed.reply.trim()) {
    throw new Error('TAEGYEOM_EVAL_INVALID_REPLY');
  }
  const usage = payload.usage;
  if (!Number.isSafeInteger(usage?.prompt_tokens) ||
      !Number.isSafeInteger(usage?.completion_tokens) ||
      usage.prompt_tokens < 1 || usage.completion_tokens < 1 ||
      typeof usage.cost !== 'number' || !Number.isFinite(usage.cost) || usage.cost < 0) {
    throw new Error('TAEGYEOM_EVAL_USAGE_UNKNOWN_HOLD');
  }
  estimatedCostUsd += usage.cost;
  totalInputTokens += usage.prompt_tokens;
  totalOutputTokens += usage.completion_tokens;
  if (estimatedCostUsd > MAX_ESTIMATED_COST_USD) {
    throw new Error('TAEGYEOM_EVAL_COST_CEILING_EXCEEDED');
  }
  results.push({
    id: spec.id,
    dimension: spec.dimension,
    input: spec.text,
    reply: parsed.reply,
    elapsedMs: Math.round(performance.now() - t0),
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    providerReportedCostUsd: usage.cost,
  });
  console.log(JSON.stringify({
    case: spec.id,
    completed: results.length,
    total: CASES.length,
    elapsedMs: results.at(-1).elapsedMs,
    providerReportedCostUsd: usage.cost,
  }));
}
const report = {
  schemaVersion: 'taegyeom-runtime-12case-v1',
  mode: 'ISOLATED_SYNTHETIC_SINGLE_TURN',
  characterId: 'taegyeom',
  model: MODEL,
  promptSource: 'approved CHARACTER_RUNTIME_AUTHORING_V1',
  productionChanged: false,
  productionConversationReadOrWritten: false,
  relationshipOrMemoryStateChanged: false,
  maxCalls: MAX_CALLS,
  maxOutputTokensPerCall: MAX_OUTPUT_TOKENS,
  maxProviderReportedCostUsd: MAX_ESTIMATED_COST_USD,
  completedCases: results.length,
  totalInputTokens,
  totalOutputTokens,
  providerReportedCostUsd: Number(estimatedCostUsd.toFixed(8)),
  durationMs: Math.round(performance.now() - started),
  results,
};
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({
  verdict: 'COMPLETED',
  completedCases: results.length,
  providerReportedCostUsd: report.providerReportedCostUsd,
  artifact: OUTPUT,
  productionChanged: false,
}));
