import assert from 'node:assert/strict';
import {
  agents,
  buildAgentInput,
  buildAgentInstructions,
  buildIntegrationInput,
  buildResponsePayload,
  validateAgentOutput,
  validateIntegrationOutput,
  validateRoundTwoOutput,
} from '../room-server.mjs';

function message(agent, content, round) {
  return {
    agent,
    label: agent === 'world' ? 'World' : agent === 'revenue' ? 'Revenue' : 'Engineering',
    content,
    round,
  };
}

const lifeThreadMeeting = {
  topic: 'Life Thread resurfacing v0.1을 설계한다. 가격·정확한 cooldown 일수·DB schema는 확정하지 않는다.',
  maxRounds: 2,
  messages: [
    { agent: 'user', label: 'user', content: 'Life Thread resurfacing v0.1', round: undefined },
    message('world', 'POSITION\n관계 continuity를 보존하려면 캐릭터가 자신이 실제로 참여한 thread만 자연스럽게 되짚어야 한다.\nREQUIREMENTS FOR OTHER TRACKS\n서버가 참여 범위를 확정해야 한다.', 1),
    message('revenue', 'POSITION\nresurfacing은 장기 Artifact 입력 가치가 될 수 있으나 무료 chat을 대체하면 cannibalization 위험이 있다.\nREQUIREMENTS FOR OTHER TRACKS\n유료 전환은 명시적 artifact와 분리해야 한다.', 1),
    message('engineering', 'POSITION\nthread association과 eligibility는 server-side metadata로 판정해야 한다.\nRISKS\n전체 로그 재주입은 privacy·cost·latency를 키운다.', 1),
    message('world', 'ACCEPT\n- Engineering의 server-side 참여 판정을 수용한다. [Engineering R1]\nOBJECT\n- Revenue의 전환 중심 접근은 관계 경험을 훼손할 수 있어 artifact 요청이 명시적일 때만 연결해야 한다. [Revenue R1]\nDELTA\n- 자연스러운 대화 재개와 artifact 제안을 분리한다.', 2),
  ],
};

const roundTwoPrompt = buildAgentInput(lifeThreadMeeting, 'revenue', 2);
assert.match(roundTwoPrompt, /\[YOUR ROUND 1 POSITION\]/);
assert.match(roundTwoPrompt, /\[OTHER AGENTS' ROUND 1 POSITIONS\]/);
assert.match(roundTwoPrompt, /\[ROUND 2 TASK\]/);
assert.match(roundTwoPrompt, /ACCEPT[\s\S]*OBJECT[\s\S]*DELTA/);
assert.match(roundTwoPrompt, /\[World R1\]/);
assert.match(roundTwoPrompt, /\[Engineering R1\]/);
assert.match(roundTwoPrompt, /자기 Agent 인용은 금지/);
assert.match(roundTwoPrompt, /\[Agent R1\].*익명 인용은 금지/);
assert.match(buildAgentInstructions('world', 2), /ACCEPT \/ OBJECT \/ DELTA/);
assert.equal(agents.world.maxOutputTokens, 800);
assert.equal(agents.revenue.maxOutputTokens, 800);
assert.equal(agents.engineering.maxOutputTokens, 900);
assert.equal(agents.integration.maxOutputTokens, 1500);
assert.equal(buildResponsePayload(lifeThreadMeeting, 'world', 1).reasoning.effort, 'minimal');
assert.equal(buildResponsePayload(lifeThreadMeeting, 'integration', 3).reasoning.effort, 'low');

const validRoundTwo = `ACCEPT
- World의 주장 수용. [World R1]
OBJECT
- NO MATERIAL OBJECTION
DELTA
- NO MATERIAL CHANGE`;
assert.doesNotThrow(() => validateRoundTwoOutput('revenue', validRoundTwo));
assert.doesNotThrow(() => validateAgentOutput('engineering', 2, validRoundTwo));

const selfAccept = `ACCEPT
- Engineering의 요구를 수용한다. [Engineering R1]
OBJECT
- x [World R1]
DELTA
- y`;
assert.throws(() => validateRoundTwoOutput('engineering', selfAccept), /ACCEPT.*자기 Agent 주장/);

const anonymousAccept = `ACCEPT
- 비용 제어 요구를 수용한다. [Agent R1]
OBJECT
- x [Revenue R1]
DELTA
- y`;
assert.throws(() => validateRoundTwoOutput('engineering', anonymousAccept), /익명 Agent 인용/);

assert.throws(
  () => validateRoundTwoOutput('revenue', 'ACCEPT\n- World 주장 수용. [World R1]\nDELTA\n- z'),
  /OBJECT/,
);

const unlimitedChatMeeting = {
  topic: '명하의 기본 Character Chat을 무료 사용자에게 완전 무제한으로 제공해야 하는가?',
  maxRounds: 2,
  messages: [
    { agent: 'user', label: 'user', content: '가격·정확한 quota 숫자는 확정하지 않는다.', round: undefined },
    message('world', 'POSITION\n접근성은 필요하지만 관계가 사용량 제한 알림에 의해 기계적으로 끊기면 안 된다.', 1),
    message('revenue', 'POSITION\n완전 무제한 무료는 paid artifact 필요성과 전환을 약화할 수 있다.', 1),
    message('engineering', 'POSITION\n완전 무제한은 inference cost·abuse·capacity를 bounded하게 유지하기 어렵다.', 1),
    message('world', 'ACCEPT\n- Engineering의 abuse 통제 필요성을 수용한다. [Engineering R1]\nOBJECT\n- Revenue의 전환 우선 접근은 관계 종료처럼 느껴질 수 있어 반대한다. [Revenue R1]\nDELTA\n- 제한이 있더라도 관계 continuity를 훼손하지 않는 UX 조건을 추가한다.', 2),
    message('revenue', 'ACCEPT\n- World의 관계 continuity 조건을 수용한다. [World R2]\nOBJECT\n- Engineering의 비용 통제만으로는 전환 경계를 설명할 수 없어 artifact 가치 경계를 함께 검증해야 한다. [Engineering R1]\nDELTA\n- 전환보다 cannibalization 방지 조건을 우선 검토한다.', 2),
    message('engineering', 'ACCEPT\n- World의 관계 continuity 조건을 수용한다. [World R2]\nOBJECT\n- Revenue의 전환 경계만으로는 abuse와 capacity를 bounded하게 만들 수 없어 server-side rate control이 필요하다. [Revenue R2]\nDELTA\n- UI보다 authority와 rate-control boundary를 먼저 검증한다.', 2),
  ],
};

const integrationPrompt = buildIntegrationInput(unlimitedChatMeeting);
assert.match(integrationPrompt, /실제로 확인되는 주장만 분류/);
assert.match(integrationPrompt, /최소 두 Agent의 실제 주장이 양립하지 않을 때만/);
assert.match(integrationPrompt, /NONE OBSERVED IN TRANSCRIPT/);
assert.match(integrationPrompt, /NOT RAISED IN TRANSCRIPT/);
assert.match(integrationPrompt, /\[World R2\]/);
assert.match(integrationPrompt, /transcript에 없는 이분법/);
assert.match(integrationPrompt, /NEXT TEST.*실행 가능한 다음 검증/s);
assert.match(integrationPrompt, /반드시 한국어로 작성/);

const completeIntegration = `AGREED
- 관계 continuity를 보존한다. [World R2]
CONFLICT
- NONE OBSERVED IN TRANSCRIPT
REQUIREMENTS
- 서버에서 비용과 abuse를 제어한다. [Engineering R2]
DECISION CANDIDATE
- 무료 관계 Core와 명시적 Artifact를 분리하는 방향을 후보로 둔다. [Revenue R2]
FAILURE CASES
- NOT RAISED IN TRANSCRIPT
METRICS / VALIDATION
- 무료 대화 COGS와 Artifact 전환을 함께 관찰한다. [Revenue R2]
OPEN
- 정확한 quota 수치는 미정이다. [Engineering R2]
NEXT TEST
- 동일 주제로 7-call live 회의를 재실행해 Round 2의 구체 인용과 Integration 완결성을 검증한다.`;
assert.doesNotThrow(() => validateIntegrationOutput(completeIntegration));
assert.doesNotThrow(() => validateAgentOutput('integration', 3, completeIntegration));

const truncatedNextTest = completeIntegration.replace(
  '- 동일 주제로 7-call live 회의를 재실행해 Round 2의 구체 인용과 Integration 완결성을 검증한다.',
  '- 파일',
);
assert.throws(() => validateIntegrationOutput(truncatedNextTest), /NEXT TEST.*실행 가능한/);

const emptySection = completeIntegration.replace(
  'OPEN\n- 정확한 quota 수치는 미정이다. [Engineering R2]\nNEXT TEST',
  'OPEN\nNEXT TEST',
);
assert.throws(() => validateIntegrationOutput(emptySection), /섹션 내용이 비었습니다: OPEN/);

console.log('PASS Test A: Round 2 concrete citation, self-citation, anonymous-citation, and DELTA protocol');
console.log('PASS Test B: Integration section completeness and actionable NEXT TEST protocol');
