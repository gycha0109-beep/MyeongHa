import assert from 'node:assert/strict';
import { evaluateMeeting, mergeRecordedCases, snapshotMeeting } from './quality-recording.mjs';

const validRoundTwo = {
  world: `ACCEPT\n- Engineering의 요구를 수용한다. [Engineering R1]\nOBJECT\n- NO MATERIAL OBJECTION\nDELTA\n- NO MATERIAL CHANGE`,
  revenue: `ACCEPT\n- World의 요구를 수용한다. [World R1]\nOBJECT\n- NO MATERIAL OBJECTION\nDELTA\n- NO MATERIAL CHANGE`,
  engineering: `ACCEPT\n- Revenue의 요구를 수용한다. [Revenue R1]\nOBJECT\n- NO MATERIAL OBJECTION\nDELTA\n- NO MATERIAL CHANGE`,
};

const integration = `AGREED\n- 관계 continuity를 보존한다. [World R2]\nCONFLICT\n- NONE OBSERVED IN TRANSCRIPT\nREQUIREMENTS\n- 서버 authority를 유지한다. [Engineering R2]\nDECISION CANDIDATE\n- 명시적 Artifact 경계를 후보로 둔다. [Revenue R2]\nFAILURE CASES\n- NOT RAISED IN TRANSCRIPT\nMETRICS / VALIDATION\n- COGS와 전환을 함께 관찰한다. [Revenue R2]\nOPEN\n- 정확한 quota는 미정이다. [Engineering R2]\nNEXT TEST\n- 동일 조건의 7-call 회의를 재실행해 Round 2 인용과 Integration 완결성을 검증한다. [Engineering R2]`;

const meeting = {
  topic: 'fixture replay protocol',
  agents: ['world', 'revenue', 'engineering', 'integration'],
  maxRounds: 2,
  maxAgentCalls: 7,
  webSearch: false,
  calls: 7,
  status: 'completed',
  messages: [
    { agent: 'world', label: 'World', round: 2, content: validRoundTwo.world },
    { agent: 'revenue', label: 'Revenue', round: 2, content: validRoundTwo.revenue },
    { agent: 'engineering', label: 'Engineering', round: 2, content: validRoundTwo.engineering },
    { agent: 'integration', label: 'Integration', round: 3, content: integration },
  ],
};

const evaluation = evaluateMeeting(meeting);
assert.equal(evaluation.completedPass, true);
assert.equal(evaluation.sevenCallsPass, true);
assert.equal(evaluation.roundTwoPass, true);
assert.equal(evaluation.integrationGroundingPass, true);
assert.equal(evaluation.semanticEvolutionPass, true);
assert.equal(evaluation.integrationPass, true);
assert.equal(evaluation.passed, true);

const sixCalls = structuredClone(meeting);
sixCalls.calls = 6;
const sixCallEvaluation = evaluateMeeting(sixCalls);
assert.equal(sixCallEvaluation.sevenCallsPass, false);
assert.equal(sixCallEvaluation.passed, false);
assert.equal(snapshotMeeting(meeting).messages.length, 4);

const oldRecording = {
  version: 1,
  runtimeFingerprint: 'old-runtime',
  cases: [{ name: 'Test A — old', meeting: snapshotMeeting(meeting) }],
};
const merged = mergeRecordedCases(oldRecording, [
  { name: 'Test B — new', runtimeFingerprint: 'new-runtime', meeting: snapshotMeeting(meeting) },
], 'new-runtime');
assert.equal(merged.length, 2);
assert.equal(merged.find((item) => item.name.startsWith('Test A')).runtimeFingerprint, 'old-runtime');
assert.equal(merged.find((item) => item.name.startsWith('Test B')).runtimeFingerprint, 'new-runtime');

const replaced = mergeRecordedCases({ version: 2, cases: merged }, [
  { name: 'Test A — old', runtimeFingerprint: 'newer-runtime', meeting: snapshotMeeting(meeting) },
], 'newer-runtime');
assert.equal(replaced.length, 2);
assert.equal(replaced.find((item) => item.name.startsWith('Test A')).runtimeFingerprint, 'newer-runtime');

console.log('PASS Test C: recorded replay validates and case history survives runtime fingerprint changes');
