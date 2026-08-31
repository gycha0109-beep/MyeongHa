import assert from 'node:assert/strict';
import { buildAgentInput } from '../room-server.mjs';

function message(agent, label, content) {
  return { agent, label, content, round: 1 };
}

const meeting = {
  topic: 'strict Round 2 source contract fixture',
  maxRounds: 2,
  messages: [
    message('world', 'World', 'POSITION\n- 관계 continuity를 우선한다.'),
    message('revenue', 'Revenue', 'POSITION\n- 비용과 전환 경계를 검증한다.'),
    message('engineering', 'Engineering', 'POSITION\n- 서버 authority를 유지한다.'),
  ],
};

const prompt = buildAgentInput(meeting, 'revenue', 2);
assert.match(prompt, /ROUND 2 SOURCE RULES — STRICT OUTPUT CONTRACT/);
assert.match(prompt, /허용 출처 토큰: \[World R1\], \[Engineering R1\]/);
assert.match(prompt, /bullet의 첫 토큰을 반드시 해당 출처로 시작/);
assert.match(prompt, /ACCEPT 전체에서 대괄호 출처 토큰을 정확히 1번만/);
assert.match(prompt, /OBJECT 전체에서 대괄호 출처 토큰을 정확히 1번만/);
assert.match(prompt, /- NO MATERIAL OBJECTION/);
assert.match(prompt, /- NO MATERIAL CHANGE/);
assert.match(prompt, /\[Revenue R1\]\/\[Revenue R2\] 자기 Agent 인용은 금지/);

console.log('PASS Test D: strict Round 2 source tokens and output skeleton are locked');
