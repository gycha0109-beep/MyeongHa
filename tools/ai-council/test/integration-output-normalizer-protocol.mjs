import assert from 'node:assert/strict';
import { canonicalizeIntegrationOutput } from './integration-output-normalizer.mjs';
import { validateIntegrationSemanticEvolution } from '../integration-semantic-evolution.mjs';

const raw = `AGREED
- 관계 코어 무료 + 안전경계를 수용한다. [World R2] [Revenue R2]
CONFLICT
1. 무제한 무료 제공 여부 — unresolved
- World: 초기 무제한 입장 [World R1]
- Revenue: 초기 제한 입장 [Revenue R1]
- Engineering: 초기 거부 입장 [Engineering R1]
Status: partially resolved in Round 2 [World R2] [Revenue R2] [Engineering R2]
REQUIREMENTS
- 안전경계를 둔다. [Engineering R2]
DECISION CANDIDATE
- 관계 코어 무료 + 안전경계. [World R2] [Engineering R2]
FAILURE CASES
- 비용 폭등 위험. [Revenue R1]
METRICS / VALIDATION
- 비용을 측정한다. [Engineering R1]
OPEN
- 세부 한도 미정. [World R1]
NEXT TEST
- 안전경계 정책을 비교한다. [Engineering R2]`;

const normalized = canonicalizeIntegrationOutput(raw);
assert.match(normalized, /CONFLICT\n- 논점: 무제한 무료 제공 여부 — unresolved/);
assert.match(normalized, /\n  World: 초기 무제한 입장 \[World R1\]/);
assert.match(normalized, /\n  Revenue: 초기 제한 입장 \[Revenue R1\]/);
assert.match(normalized, /\n  Engineering: 초기 거부 입장 \[Engineering R1\]/);
assert.match(normalized, /\n  Status: partially resolved in Round 2/);

const meeting = {
  topic: '가격·정확한 quota 숫자는 확정하지 않는다.',
  messages: [
    { agent: 'world', label: 'World', round: 2, content: 'ACCEPT\n- [Engineering R1] 안전경계를 수용한다.\nOBJECT\n- [Revenue R1] 전면 제한에는 반대한다.\nDELTA\n- NO MATERIAL CHANGE' },
    { agent: 'revenue', label: 'Revenue', round: 2, content: 'ACCEPT\n- [World R2] 관계 코어 무료를 수용한다.\nOBJECT\n- [Engineering R1] 전면 거부에는 반대한다.\nDELTA\n- NO MATERIAL CHANGE' },
    { agent: 'engineering', label: 'Engineering', round: 2, content: 'ACCEPT\n- [World R2] 관계 코어 무료를 수용한다.\nOBJECT\n- [Revenue R2] 안전경계가 더 강해야 한다.\nDELTA\n- NO MATERIAL CHANGE' },
  ],
};

assert.throws(
  () => validateIntegrationSemanticEvolution(meeting, normalized),
  /World.*\[World R2\]만.*\[World R1\]/,
);

console.log('PASS Test G: numbered conflict layouts normalize structurally while stale R1 current stances still fail');
