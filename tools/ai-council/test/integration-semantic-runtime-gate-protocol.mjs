import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const originalFetch = globalThis.fetch;
const requests = [];
let output = '';

globalThis.fetch = async (resource, options = {}) => {
  requests.push({ resource: String(resource), payload: JSON.parse(String(options.body || '{}')) });
  return new Response(JSON.stringify({ status: 'completed', output_text: output }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

await import(`../integration-semantic-runtime-gate.mjs?protocol=${Date.now()}`);

const source = `회의 주제:\n정확한 기간은 확정하지 않는다.\n\n[ACTUAL TRANSCRIPT]\n[World R2]\n관계 코어를 무료로 보장한다.\n\n[Revenue R2]\n관계 코어 무료를 수용하고 심화 기능은 유료화한다.\n\n[Engineering R2]\n관계 코어 무료를 수용하되 서버 QoS 안전경계를 요구한다.\n\n[INTEGRATION TASK]\n실제 transcript만 통합한다.`;

output = `AGREED
- 관계 코어 무료 방향을 수용한다. [World R2] [Revenue R2] [Engineering R2]
CONFLICT
- NONE OBSERVED IN TRANSCRIPT
REQUIREMENTS
- 서버 안전경계를 둔다. [Engineering R2]
DECISION CANDIDATE
- 심화 기능 유료화를 후보로 둔다. [Revenue R2]
FAILURE CASES
- NOT RAISED IN TRANSCRIPT
METRICS / VALIDATION
- 비용과 전환을 측정한다. [Revenue R2]
OPEN
- 정확한 기간은 미정이다. [Engineering R2]
NEXT TEST
- 기간 미정 상태로 QoS와 전환 효과를 검증한다. [Engineering R2]`;

const success = await globalThis.fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  body: JSON.stringify({ instructions: 'MyeongHa Integration Agent', input: source }),
});
assert.equal(success.ok, true);
assert.equal(requests.length, 1);
assert.match(requests[0].payload.input, /\[INTEGRATION SEMANTIC EVOLUTION RULE\]/);
assert.equal((requests[0].payload.input.match(/\[INTEGRATION SEMANTIC EVOLUTION RULE\]/g) || []).length, 1);

output = output.replace(
  '- 기간 미정 상태로 QoS와 전환 효과를 검증한다. [Engineering R2]',
  '- 4주 동안 QoS와 전환 효과를 검증한다. [Engineering R2]',
);
await assert.rejects(
  () => globalThis.fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    body: JSON.stringify({ instructions: 'MyeongHa Integration Agent', input: source }),
  }),
  /없는 정량 수치.*4주.*REJECTED integration OUTPUT/s,
);
assert.equal(requests.length, 2);
assert.match(requests[1].payload.input, /예: source에 없는 "4주", "30일", "10%"/);

output = `CONFLICT
- 논점: 현재 stance
  Revenue: 초기 입장을 현재 충돌로 유지한다. [Revenue R1]`;
await assert.rejects(
  () => globalThis.fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    body: JSON.stringify({ instructions: 'MyeongHa Integration Agent', input: source }),
  }),
  /Revenue.*\[Revenue R2\]만.*\[Revenue R1\].*REJECTED integration OUTPUT/s,
);

const roomServerSource = await readFile(new URL('../room-server.mjs', import.meta.url), 'utf8');
assert.match(roomServerSource, /import '\.\/integration-semantic-runtime-gate\.mjs';/);

globalThis.fetch = originalFetch;
console.log('PASS Test H: production semantic fetch gate injects instructions and rejects stale stance/invented numbers without API calls');
