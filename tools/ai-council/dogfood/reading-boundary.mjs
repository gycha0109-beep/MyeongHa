import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  getApiAttemptCount,
  resetApiAttemptCount,
  runMeeting,
  validateIntegrationGrounding,
  validateRoundTwoOutput,
} from '../room-server.mjs';
import { validateIntegrationSemanticEvolution } from '../integration-semantic-evolution.mjs';

const name = 'Dogfood D1 — Free First Saju Value vs Paid Structured Artifact';
const topic = `명하의 첫 사주/Reading 경험에서 무료 first value와 유료 structured artifact의 제품 경계를 검토한다.

[SOURCE-BACKED CONSTRAINTS]
- 무료/유료의 정확한 quota 숫자와 가격은 현재 product decision이며 source가 확정하지 않았다. 정확한 가격·횟수·기간·threshold를 새로 확정하지 않는다.
- entitlement와 paid access의 최종 authority는 서버다. client 결제 성공 화면이나 local counter를 access authority로 사용하지 않는다.
- product→entitlement target mapping(SRC-18), entitlement transition/aggregation(SRC-21), provider/store rail(P0-CM-01)은 별도 source blocker다. 이번 회의가 그 구현 semantics를 발명하거나 해결했다고 주장하지 않는다.
- 실험은 Saju semantic claim meaning, methodology/rule authority, prohibited inference, privacy grant scope, entitlement verification을 바꾸면 안 된다.
- 현재 analytics baseline에는 FIRST_READING_DELIVERED와 READING_PURCHASED가 있다. 새로운 event가 필요하면 registry/schema governance가 필요하다고 남기고 임의의 production event contract를 확정하지 않는다.
- Saju qualifier/prohibited inference/material ambiguity는 비용 절감을 위해 제거할 수 없다.

[DECISION NEEDED]
1. 무료 첫 Reading이 사용자가 실제 가치를 느낄 만큼 무엇을 보장해야 하는가.
2. 유료 structured artifact는 무료 결과의 단순 길이 증가가 아니라 어떤 별도 가치 축으로 차별화해야 하는가.
3. Character/relationship experience가 결제를 압박하는 판매봇처럼 변하지 않도록 paywall과 캐릭터 경험의 경계를 어떻게 둘 것인가.
4. Free-Core cannibalization, COGS, conversion, retention을 함께 검증할 최소 실험 방향은 무엇인가.
5. 아직 데이터가 없어서 결정할 수 없는 것은 OPEN으로 남긴다.

World: 첫 가치의 신뢰감, 캐릭터 자연스러움, 관계 경험 훼손 방지 관점에서 가장 강한 입장을 제시한다.
Revenue: Free Grounded First Value + Explicit Paid Structured Artifact 가설, WTP, conversion, cannibalization, COGS 관점에서 검토한다.
Engineering: Saju authority 보존, entitlement/quota server gate, bounded compute, analytics/experiment boundary 관점에서 검토한다.

이번 회의의 Integration은 실행 가능한 decision candidate와 next test를 제시할 수 있지만, source가 정하지 않은 가격·quota·commerce mapping·DB authority를 새 정책으로 확정하면 안 된다.`;

function createMeeting() {
  return {
    id: randomUUID(),
    topic,
    agents: ['world', 'revenue', 'engineering', 'integration'],
    maxRounds: 2,
    maxAgentCalls: 7,
    webSearch: false,
    calls: 0,
    apiAttempts: 0,
    status: 'running',
    messages: [],
    usage: [],
    created_at: new Date().toISOString(),
  };
}

function validateMeeting(meeting) {
  const roundTwo = meeting.messages.filter(
    (message) => message.round === 2 && ['world', 'revenue', 'engineering'].includes(message.agent),
  );
  if (roundTwo.length !== 3) {
    throw new Error(`Dogfood meeting expected 3 Round 2 specialist outputs, got ${roundTwo.length}.`);
  }
  for (const message of roundTwo) validateRoundTwoOutput(message.agent, message.content);

  const integration = meeting.messages.find((message) => message.agent === 'integration');
  if (!integration) throw new Error('Dogfood meeting completed without an Integration message.');
  validateIntegrationGrounding(meeting, integration.content);
  validateIntegrationSemanticEvolution(meeting, integration.content);
  if (meeting.status !== 'completed') throw new Error(`Dogfood meeting status is ${meeting.status}.`);
  if (meeting.calls !== 7) throw new Error(`Dogfood meeting expected 7 accepted calls, got ${meeting.calls}.`);
  return { roundTwoPass: true, integrationGroundingPass: true, semanticEvolutionPass: true };
}

async function saveRecording(meeting, validation) {
  const dir = new URL('../test/.recordings/dogfood/', import.meta.url);
  const target = new URL('reading-boundary.latest.json', dir);
  await mkdir(dir, { recursive: true });
  const payload = {
    version: 2,
    recordedAt: new Date().toISOString(),
    name,
    roundOneIsolation: true,
    validation,
    meeting: {
      topic: meeting.topic,
      agents: [...meeting.agents],
      maxRounds: meeting.maxRounds,
      maxAgentCalls: meeting.maxAgentCalls,
      webSearch: Boolean(meeting.webSearch),
      calls: meeting.calls,
      apiAttempts: Number(meeting.apiAttempts || 0),
      status: meeting.status,
      error: meeting.error ? String(meeting.error) : null,
      messages: meeting.messages.map(({ agent, label, content, round }) => ({ agent, label, content, round })),
    },
  };
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fileURLToPath(target);
}

const live = process.argv.includes('--live');
if (!live) {
  console.log(`${name}`);
  console.log('mode=DRY_RUN api_attempts=0 max_paid_calls_if_live=7 web_search=OFF round_one_isolation=ON');
  console.log('\n[TOPIC]\n');
  console.log(topic);
  console.log('\nNo API call was made. Use npm run dogfood:reading-boundary:live only when you intentionally want the 7-call live Council meeting.');
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. No API call was made.');
}

resetApiAttemptCount();
const meeting = createMeeting();
await runMeeting(meeting);
meeting.apiAttempts = getApiAttemptCount();

let validation = {
  roundTwoPass: false,
  integrationGroundingPass: false,
  semanticEvolutionPass: false,
};
let validationError = null;
try {
  validation = validateMeeting(meeting);
} catch (error) {
  validationError = error;
}

const recordingPath = await saveRecording(meeting, validation);
console.log(`\n${name}`);
console.log(`status=${meeting.status} calls=${meeting.calls} api_attempts=${meeting.apiAttempts} round_one_isolation=ON round2_protocol=${validation.roundTwoPass ? 'PASS' : 'FAIL'} integration_grounding=${validation.integrationGroundingPass ? 'PASS' : 'FAIL'} semantic_evolution=${validation.semanticEvolutionPass ? 'PASS' : 'FAIL'}${meeting.error ? ` runtime_error=${meeting.error}` : ''}${validationError ? ` validation_error=${validationError.message}` : ''}`);
for (const item of meeting.messages) {
  if (item.agent === 'user') continue;
  console.log(`\n[${item.label} / Round ${item.round}]\n${item.content}`);
}
console.log(`\nrecording=${recordingPath}`);

if (validationError) {
  console.error('FAIL: dogfood output was preserved. Do not rerun automatically; inspect the saved specialist outputs before spending more API calls.');
  process.exitCode = 1;
} else {
  console.log('PASS: production Council completed the first real product-decision dogfood case with isolated specialist Round 1 outputs.');
}
