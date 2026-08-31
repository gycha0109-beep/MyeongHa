import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { integrationSemanticInstruction, validateIntegrationSemanticEvolution } from '../integration-semantic-evolution.mjs';
import { canonicalizeIntegrationOutput } from '../test/integration-output-normalizer.mjs';

const rawFetch = globalThis.fetch.bind(globalThis);
const {
  buildResponsePayload,
  validateIntegrationGrounding,
  validateRoundTwoOutput,
} = await import('../room-server.mjs');

const recordingUrl = new URL('../test/.recordings/dogfood/reading-boundary.latest.json', import.meta.url);
const recording = JSON.parse(await readFile(recordingUrl, 'utf8'));
const source = recording.meeting;

if (!source || !Array.isArray(source.messages)) {
  throw new Error('Dogfood recording does not contain a meeting. No API call was made.');
}
if (source.messages.some((message) => message.agent === 'integration')) {
  throw new Error('Dogfood recording already contains an Integration message; refusing ambiguous retry. No API call was made.');
}

const roundTwo = source.messages.filter(
  (message) => message.round === 2 && ['world', 'revenue', 'engineering'].includes(message.agent),
);
if (roundTwo.length !== 3) {
  throw new Error(`Dogfood recording has ${roundTwo.length}/3 Round 2 specialist outputs. No API call was made.`);
}
for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. No API call was made.');
}

const meeting = structuredClone(source);
meeting.status = 'running';
meeting.error = null;
const sourceApiAttempts = Number(source.apiAttempts || 0);
const payload = buildResponsePayload(meeting, 'integration', meeting.maxRounds + 1);
const configuredLimit = Number(process.env.COUNCIL_DOGFOOD_INTEGRATION_MAX_OUTPUT_TOKENS || 0);
payload.max_output_tokens = Number.isFinite(configuredLimit) && configuredLimit >= 4000 ? configuredLimit : 5000;
payload.input = `${payload.input}\n\n${integrationSemanticInstruction()}\n\n[DOGFOOD D1 RETRY PRIORITY]\n- 이번 재시도는 이미 성공한 specialist 6개를 재사용한다. 새 specialist 입장을 발명하지 마십시오.\n- 핵심 제품 결정은 (1) 무료 first value, (2) paid structured artifact 차별축, (3) Character/paywall 경계, (4) COGS·conversion·retention 검증 실험입니다. DECISION CANDIDATE와 NEXT TEST는 이 네 축을 우선하십시오.\n- server-signed token, client cache/local display 같은 구현 아이디어는 transcript에 있더라도 source-backed authority가 아닙니다. 필요하면 OPEN 또는 구현 후보로만 기록하고 핵심 제품 결론으로 승격하지 마십시오.\n- 서버가 access authority라는 원칙과 비권한적 UI 표시 허용 여부는 논리적으로 같은 문제가 아닙니다. 실제 R2 발언이 양립 가능하면 가짜 CONFLICT를 만들지 말고 AGREED/OPEN으로 분류하십시오.\n- source가 정하지 않은 가격, quota, commerce mapping, DB authority를 확정하지 마십시오.\n- 출력은 8개 필수 섹션을 모두 완결하고 NEXT TEST 마지막 bullet에서 종료하십시오.`;

let retryApiAttempts = 0;
let response;
let body = {};
let rawContent = '';
let content = '';
let error = null;

try {
  retryApiAttempts = 1;
  response = await rawFetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  body = await response.json().catch(() => ({}));
  rawContent = typeof body.output_text === 'string'
    ? body.output_text.trim()
    : (Array.isArray(body.output)
      ? body.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
        .trim()
      : '');
  content = canonicalizeIntegrationOutput(rawContent);

  if (!response.ok) {
    throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  }
  if (body.status === 'incomplete') {
    throw new Error(`Integration retry incomplete. reason=${body.incomplete_details?.reason || 'unknown'}`);
  }

  validateIntegrationGrounding(meeting, content);
  validateIntegrationSemanticEvolution(meeting, content);
} catch (caught) {
  error = caught;
}

if (error) {
  const failedPayload = {
    ...recording,
    retry: {
      attemptedAt: new Date().toISOString(),
      sourceApiAttempts,
      retryApiAttempts,
      maxOutputTokens: payload.max_output_tokens,
      validationError: String(error?.message || error),
      rejectedIntegrationRaw: rawContent || null,
      rejectedIntegrationCanonical: content || null,
    },
  };
  await writeFile(recordingUrl, `${JSON.stringify(failedPayload, null, 2)}\n`, 'utf8');
  console.error(`Dogfood D1: status=failed source_api_attempts=${sourceApiAttempts} retry_api_attempts=${retryApiAttempts} error=${error.message}`);
  if (content) console.error(`\n[REJECTED Integration / Round ${meeting.maxRounds + 1}]\n${content}`);
  console.error('\nFAIL: retry output was preserved. Do not rerun automatically.');
  process.exitCode = 1;
} else {
  meeting.messages.push({
    agent: 'integration',
    label: 'Integration',
    content,
    round: meeting.maxRounds + 1,
  });
  meeting.calls = 7;
  meeting.apiAttempts = sourceApiAttempts + retryApiAttempts;
  meeting.status = 'completed';
  meeting.error = null;

  const successPayload = {
    version: 2,
    recordedAt: new Date().toISOString(),
    name: recording.name || 'Dogfood D1 — Free First Saju Value vs Paid Structured Artifact',
    validation: {
      roundTwoPass: true,
      integrationGroundingPass: true,
      semanticEvolutionPass: true,
    },
    retry: {
      sourceApiAttempts,
      retryApiAttempts,
      maxOutputTokens: payload.max_output_tokens,
    },
    meeting,
  };
  await writeFile(recordingUrl, `${JSON.stringify(successPayload, null, 2)}\n`, 'utf8');
  console.log(`Dogfood D1: status=completed calls=7 source_api_attempts=${sourceApiAttempts} retry_api_attempts=${retryApiAttempts} total_api_attempts=${meeting.apiAttempts} round2_protocol=PASS integration_grounding=PASS semantic_evolution=PASS`);
  console.log(`\n[Integration / Round ${meeting.maxRounds + 1}]\n${content}`);
  console.log(`\nrecording=${recordingUrl.pathname}`);
  console.log('PASS: reused all six specialist outputs and paid only for one new Integration attempt.');
}
