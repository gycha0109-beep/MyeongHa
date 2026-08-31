import assert from 'node:assert/strict';
import { buildIntegrationInput, validateIntegrationGrounding } from '../room-server.mjs';

const meeting = {
  topic: 'Integration grounding regression fixture',
  messages: [
    { agent: 'world', label: 'World', round: 1, content: 'POSITION\n- 서버 authority를 유지한다.' },
    { agent: 'revenue', label: 'Revenue', round: 1, content: 'POSITION\n- 유료 전환 경로가 명확해야 한다.' },
    { agent: 'engineering', label: 'Engineering', round: 1, content: 'POSITION\n- 서버가 eligibility를 확정한다.' },
    { agent: 'world', label: 'World', round: 2, content: 'ACCEPT\n- [Engineering R1] 서버 authority를 수용한다.\nOBJECT\n- [Revenue R1] 유료 전환 경로 요구를 paid-only로 해석하는 데 반대한다.\nDELTA\n- summary 무료/detail 유료를 제안한다.' },
    { agent: 'revenue', label: 'Revenue', round: 2, content: 'ACCEPT\n- [World R2] summary 무료/detail 유료 분리를 수용한다.\nOBJECT\n- [Engineering R1] level flag를 서버가 소유하는 데 반대한다.\nDELTA\n- level 분기는 플랫폼이 맡는다.' },
    { agent: 'engineering', label: 'Engineering', round: 2, content: 'ACCEPT\n- [World R2] summary/detail 분리를 수용한다.\nOBJECT\n- [Revenue R2] level 분기 완전 위임에 반대한다.\nDELTA\n- level flag를 서버가 보유한다.' },
  ],
};

const prompt = buildIntegrationInput(meeting);
assert.match(prompt, /모든 실제 bullet\/block은 최소 1개의 구체 citation/);
assert.match(prompt, /R1은 역사적 배경으로 함께 쓸 수 있지만 최신 입장의 단독 근거가 될 수 없습니다/);
assert.match(prompt, /EVIDENCE \"transcript 원문에서 그대로 복사한 8자 이상 구절\"/);
assert.match(prompt, /원문의 강도를 키우지 마십시오/);

const base = `AGREED
- summary 무료/detail 유료 분리를 수용한다. [World R2] [Revenue R2]
CONFLICT
- 논점: level flag authority
  Revenue: 플랫폼이 level 분기를 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]
  Engineering: 서버가 level flag를 보유한다. | EVIDENCE "level flag를 서버가 보유한다." [Engineering R2]
  Status: unresolved in Round 2
REQUIREMENTS
- 서버 authority를 유지한다. [Engineering R1]
DECISION CANDIDATE
- level authority는 별도 결정이 필요하다. [Revenue R2] [Engineering R2]
FAILURE CASES
- 비참여 Thread 회상은 신뢰를 훼손한다. [World R1]
METRICS / VALIDATION
- 전환과 비용을 검증한다. [Revenue R1]
OPEN
- level authority는 미해결이다. [Revenue R2] [Engineering R2]
NEXT TEST
- level flag를 서버와 플랫폼 중 어디에 둘지 권한 검증 테스트를 수행한다. [Engineering R2]`;

assert.doesNotThrow(() => validateIntegrationGrounding(meeting, base));

const staleRoundOneConflict = base.replace(
  `CONFLICT
- 논점: level flag authority
  Revenue: 플랫폼이 level 분기를 맡는다. | EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]
  Engineering: 서버가 level flag를 보유한다. | EVIDENCE "level flag를 서버가 보유한다." [Engineering R2]
  Status: unresolved in Round 2`,
  `CONFLICT
- 논점: 유료 전환 요구 vs 무료 summary
  World: summary 무료/detail 유료를 제안한다. | EVIDENCE "summary 무료/detail 유료를 제안한다." [World R2]
  Revenue: 반드시 유료 Artifact로만 연결해야 한다. | EVIDENCE "유료 전환 경로가 명확해야 한다." [Revenue R1]
  Status: partially resolved in Round 2`,
);
assert.throws(
  () => validateIntegrationGrounding(meeting, staleRoundOneConflict),
  /Revenue.*최신 \[Revenue R2\]/,
);

const unsupportedJointAttribution = base.replace(
  '- level authority는 별도 결정이 필요하다. [Revenue R2] [Engineering R2]',
  '- Engineering\/Revenue 대안으로 level 분기를 플랫폼에 둔다. [Revenue R2]',
);
assert.throws(
  () => validateIntegrationGrounding(meeting, unsupportedJointAttribution),
  /Engineering.*citation이 없습니다/,
);

const inventedEvidence = base.replace(
  'EVIDENCE "level 분기는 플랫폼이 맡는다." [Revenue R2]',
  'EVIDENCE "서버는 절대로 level을 가져서는 안 된다." [Revenue R2]',
);
assert.throws(
  () => validateIntegrationGrounding(meeting, inventedEvidence),
  /Revenue EVIDENCE가 cited transcript 원문과 일치하지 않습니다/,
);

const ungroundedCandidate = base.replace(
  '- level authority는 별도 결정이 필요하다. [Revenue R2] [Engineering R2]',
  '- level authority는 별도 결정이 필요하다.',
);
assert.throws(
  () => validateIntegrationGrounding(meeting, ungroundedCandidate),
  /DECISION CANDIDATE.*최소 1개의 구체 citation/,
);

console.log('PASS Test E: Integration latest stance, exact evidence, and named-agent attribution are transcript-grounded');
