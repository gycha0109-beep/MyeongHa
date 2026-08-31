import assert from 'node:assert/strict';
import { integrationSemanticInstruction, validateIntegrationSemanticEvolution } from './integration-semantic-evolution.mjs';

const meeting = {
  topic: 'Life Thread resurfacing. 가격·정확한 cooldown·DB schema는 확정하지 않는다.',
  messages: [
    { agent: 'world', label: 'World', round: 1, content: 'POSITION\n- 참여 Thread만 회상한다.' },
    { agent: 'revenue', label: 'Revenue', round: 1, content: 'POSITION\n- 유료 전환 경로가 명확하지 않으면 시행하지 않는다.' },
    { agent: 'engineering', label: 'Engineering', round: 1, content: 'POSITION\n- 서버가 eligibility를 확정한다.' },
    { agent: 'world', label: 'World', round: 2, content: 'ACCEPT\n- [Engineering R1] 서버 authority를 수용한다.\nOBJECT\n- [Revenue R1] paid-only 해석에 반대한다.\nDELTA\n- 요약 무료, 상세 유료를 제안한다.' },
    { agent: 'revenue', label: 'Revenue', round: 2, content: 'ACCEPT\n- [World R2] 요약 무료, 상세 유료 분리를 수용한다.\nOBJECT\n- [Engineering R1] level flag 서버 소유에 반대한다.\nDELTA\n- level 분기는 플랫폼이 맡는다.' },
    { agent: 'engineering', label: 'Engineering', round: 2, content: 'ACCEPT\n- [World R2] 요약/상세 분리를 수용한다.\nOBJECT\n- [Revenue R2] level 분기 완전 위임에 반대한다.\nDELTA\n- level flag는 서버가 보유한다.' },
  ],
};

const valid = `AGREED
- 요약 무료, 상세 유료 분리를 수용한다. [World R2] [Revenue R2]
CONFLICT
- 논점: level flag authority
  Revenue: level 분기는 플랫폼이 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]
  Engineering: level flag는 서버가 보유한다. | EVIDENCE "level flag는 서버가 보유한다." [Engineering R2]
  Status: unresolved in Round 2
REQUIREMENTS
- 서버 authority를 유지한다. [Engineering R1]
DECISION CANDIDATE
- level flag authority는 추가 결정이 필요하다. [Revenue R2] [Engineering R2]
FAILURE CASES
- 비참여 Thread 회상을 차단한다. [World R1]
METRICS / VALIDATION
- 전환과 비용을 함께 측정한다. [Revenue R1]
OPEN
- level flag authority는 미정이다. [Revenue R2] [Engineering R2]
NEXT TEST
- level flag authority를 서버와 플랫폼 중 어디에 둘지 검증한다. [Engineering R2]`;

assert.doesNotThrow(() => validateIntegrationSemanticEvolution(meeting, valid));

const nestedValid = valid
  .replace('  Revenue: level 분기는 플랫폼이 맡는다.', '  - Revenue: level 분기는 플랫폼이 맡는다.')
  .replace('  Engineering: level flag는 서버가 보유한다.', '  - Engineering: level flag는 서버가 보유한다.')
  .replace('  Status: unresolved in Round 2', '  - Status: unresolved in Round 2');
assert.doesNotThrow(() => validateIntegrationSemanticEvolution(meeting, nestedValid));

const staleRevenue = valid.replace(
  'Revenue: level 분기는 플랫폼이 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]',
  'Revenue: 초기 유료 전환 조건은 여전히 현재 충돌이다. | EVIDENCE "유료 전환 경로가 명확하지 않으면 시행하지 않는다." [Revenue R1]',
);
assert.throws(
  () => validateIntegrationSemanticEvolution(meeting, staleRevenue),
  /Revenue.*\[Revenue R2\]만.*\[Revenue R1\].*사용할 수 없습니다/,
);

const nestedStaleRevenue = nestedValid.replace(
  '- Revenue: level 분기는 플랫폼이 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]',
  '- Revenue: 초기 유료 전환 조건은 여전히 현재 충돌이다. | EVIDENCE "유료 전환 경로가 명확하지 않으면 시행하지 않는다." [Revenue R1]',
);
assert.throws(
  () => validateIntegrationSemanticEvolution(meeting, nestedStaleRevenue),
  /Revenue.*\[Revenue R2\]만.*\[Revenue R1\].*사용할 수 없습니다/,
);

const mixedRevenue = valid.replace(
  'Revenue: level 분기는 플랫폼이 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]',
  'Revenue: 현재 입장과 초기 입장을 함께 둔다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2] [Revenue R1]',
);
assert.throws(
  () => validateIntegrationSemanticEvolution(meeting, mixedRevenue),
  /Revenue.*\[Revenue R2\]만.*\[Revenue R1\].*사용할 수 없습니다/,
);

const inventedDuration = valid.replace(
  '- level flag authority를 서버와 플랫폼 중 어디에 둘지 검증한다. [Engineering R2]',
  '- 4주 동안 level flag authority를 서버와 플랫폼 중 어디에 둘지 검증한다. [Engineering R2]',
);
assert.throws(
  () => validateIntegrationSemanticEvolution(meeting, inventedDuration),
  /없는 정량 수치.*4주/,
);

const instruction = integrationSemanticInstruction();
assert.match(instruction, /현재 CONFLICT는 최신 stance만 비교/);
assert.match(instruction, /\[Agent R1\]은 CONFLICT 현재 입장 근거로 쓰지 마십시오/);
assert.match(instruction, /현재 R2끼리 실제로 양립하지 않을 때만 CONFLICT/);
assert.match(instruction, /서로 다른 Round의 주장을 함께 요약하면 각 주장에 해당하는 실제 Round citation을 모두/);
assert.match(instruction, /R1에만 존재하는 요구를 \[Agent R2\]만으로 인용/);
assert.match(instruction, /transcript 또는 사용자 topic에 없는 정확한 기간·quota·threshold·가격·횟수·비율/);
assert.match(instruction, /"4주"/);

console.log('PASS Test F: current conflicts are R2-only, nested bullets are parsed, mixed-round claims are instructed precisely, and invented quantitative commitments are rejected');
