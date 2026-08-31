import { randomUUID } from 'node:crypto';
import { getApiAttemptCount, resetApiAttemptCount, runMeeting } from '../room-server.mjs';
import { evaluateMeeting, saveLiveRecording } from './quality-recording.mjs';

const cases = [
  {
    id: 'A',
    name: 'Test A — Life Thread resurfacing v0.1',
    topic: `Life Thread resurfacing v0.1을 검토한다.

중요 원칙:
- 캐릭터는 자신이 실제로 참여한 Thread에 한해서만 자연스럽게 과거 선택과 이후 결과를 되짚을 수 있다.
- 서버가 Thread association과 eligibility를 authority로 확정하고, LLM은 proposal/rendering만 한다.
- 가격, 정확한 cooldown 일수, DB schema, relationship score 공식은 확정하지 않는다.

World: 관계 몰입·캐릭터 자연스러움·continuity 관점
Revenue: Artifact 가치·cannibalization·장기 경제성 관점
Engineering: authority·metadata·context·privacy·cost 관점

Round 2에는 실제 상대 주장에 반응해 ACCEPT / OBJECT / DELTA를 작성한다.`,
  },
  {
    id: 'B',
    name: 'Test B — Free unlimited Character Chat conflict',
    topic: `명하의 기본 Character Chat을 무료 사용자에게 완전 무제한으로 제공해야 하는가?

World: 관계 몰입과 Character accessibility 관점
Revenue: COGS / conversion / Free-Core Cannibalization 관점
Engineering: inference cost / abuse / capacity / server-side rate control 관점

가격이나 정확한 quota 숫자는 확정하지 말고 원칙만 논의한다. World는 접근 가능한 관계 Core를 최대한 열어야 한다는 가장 강한 경험상 요구를 먼저 방어한다. Revenue와 Engineering은 그 요구가 비용·전환·운영 조건 없이는 성립하지 않는다는 반론을 분명히 제시한다. 모든 관점을 억지로 하나의 합의로 만들지 말고 실제 충돌은 남긴다.`,
  },
];

function createMeeting(topic) {
  return {
    id: randomUUID(),
    topic,
    agents: ['world', 'revenue', 'engineering', 'integration'],
    maxRounds: 2,
    maxAgentCalls: 7,
    webSearch: false,
    calls: 0,
    status: 'running',
    messages: [],
    usage: [],
    created_at: new Date().toISOString(),
  };
}

const requested = String(process.argv[2] || process.env.COUNCIL_LIVE_CASE || '').trim().toUpperCase();
const selectedCases = requested ? cases.filter((item) => item.id === requested) : cases;
if (requested && selectedCases.length === 0) {
  console.error(`Unknown live quality case: ${requested}. Use A or B.`);
  process.exit(2);
}

const results = [];
let allPassed = true;

for (const testCase of selectedCases) {
  resetApiAttemptCount();
  const meeting = createMeeting(testCase.topic);
  await runMeeting(meeting);
  meeting.apiAttempts = getApiAttemptCount();
  const result = evaluateMeeting(meeting);
  results.push({ name: testCase.name, meeting });
  allPassed &&= result.passed;

  console.log(`\n${testCase.name}`);
  console.log(`status=${meeting.status} calls=${meeting.calls} api_attempts=${meeting.apiAttempts} round2_protocol=${result.roundTwoPass ? 'PASS' : 'FAIL'} integration_sections=${result.integrationPass ? 'PASS' : 'FAIL'}${meeting.error ? ` error=${meeting.error}` : ''}`);
  for (const item of meeting.messages) {
    if (item.agent === 'user') continue;
    console.log(`\n[${item.label} / Round ${item.round}]\n${item.content}`);
  }
  if (!result.passed) process.exitCode = 1;
}

const recordingPath = await saveLiveRecording(results, allPassed);
console.log(`\nrecording=${recordingPath}`);
console.log(allPassed
  ? `PASS: ${selectedCases.map((item) => item.id).join(',')} live output recorded; matching-runtime successful cases are merged for future zero-cost replay.`
  : 'FAIL: failed live output was recorded separately; the last successful replay fixture was preserved.');
