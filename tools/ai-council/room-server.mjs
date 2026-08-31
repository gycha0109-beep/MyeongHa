import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(import.meta.url);
const isEntrypoint = Boolean(process.argv[1] && path.resolve(process.argv[1]) === entryPath);
const corePath = path.join(path.dirname(entryPath), 'room-server-core.mjs');
const originalArgv1 = process.argv[1];
if (isEntrypoint) process.argv[1] = corePath;

const realFetch = globalThis.fetch;
const roundTwoHeadings = ['ACCEPT', 'OBJECT', 'DELTA'];
const integrationHeadings = ['AGREED', 'CONFLICT', 'REQUIREMENTS', 'DECISION CANDIDATE', 'FAILURE CASES', 'METRICS / VALIDATION', 'OPEN', 'NEXT TEST'];
const concreteCitationPattern = /\[(World|Revenue|Engineering)\s+R([12])\]/gi;
const anonymousCitationPattern = /\[(?:Agent|Other\s+Agent|Specialist)(?:\s+R[12])?\]/i;
let apiAttemptCount = 0;

function normalizeHeadingLine(line) {
  return String(line || '').trim().replace(/^#{1,6}\s*/, '').replace(/:\s*$/, '').trim().toUpperCase();
}

function parseSections(content, headings) {
  const expected = new Map(headings.map((heading) => [heading.toUpperCase(), heading]));
  const sections = {};
  const duplicates = [];
  let current = null;
  for (const line of String(content || '').split(/\r?\n/)) {
    const heading = expected.get(normalizeHeadingLine(line));
    if (heading) {
      if (Object.hasOwn(sections, heading)) duplicates.push(heading);
      current = heading;
      if (!Object.hasOwn(sections, heading)) sections[heading] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return {
    sections: Object.fromEntries(Object.entries(sections).map(([heading, lines]) => [heading, lines.join('\n').trim()])),
    duplicates,
  };
}

function sectionCoreText(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.replace(/^\s*[-*+]\s*/, '').trim()).filter(Boolean).join(' ').trim();
}

function concreteCitations(value) {
  return [...String(value || '').matchAll(concreteCitationPattern)].map((match) => ({ label: match[1], round: Number(match[2]), raw: match[0] }));
}

function isExactSentinel(value, sentinel) {
  return sectionCoreText(value).toUpperCase() === sentinel;
}

function validateRoundTwoOutput(agentName, content) {
  const label = agentName[0].toUpperCase() + agentName.slice(1);
  const { sections, duplicates } = parseSections(content, roundTwoHeadings);
  if (duplicates.length) throw new Error(`${label} Round 2 응답에 중복 섹션이 있습니다: ${[...new Set(duplicates)].join(', ')}`);
  const missing = roundTwoHeadings.filter((heading) => !Object.hasOwn(sections, heading));
  if (missing.length) throw new Error(`${label} Round 2 응답에 필수 섹션이 없습니다: ${missing.join(', ')}`);
  const empty = roundTwoHeadings.filter((heading) => !sectionCoreText(sections[heading]));
  if (empty.length) throw new Error(`${label} Round 2 응답의 섹션 내용이 비었습니다: ${empty.join(', ')}`);
  if (anonymousCitationPattern.test(content)) throw new Error(`${label} Round 2 응답에 익명 Agent 인용이 있습니다. [World R1]처럼 구체 Agent명과 Round를 사용해야 합니다.`);

  const acceptCitations = concreteCitations(sections.ACCEPT);
  if (acceptCitations.length !== 1) throw new Error(`${label} Round 2 ACCEPT는 다른 Agent의 구체 인용을 정확히 1개 포함해야 합니다.`);
  if (acceptCitations[0].label.toLowerCase() === agentName.toLowerCase()) throw new Error(`${label} Round 2 ACCEPT에서 자기 Agent 주장 ${acceptCitations[0].raw}을 수용할 수 없습니다.`);

  if (!isExactSentinel(sections.OBJECT, 'NO MATERIAL OBJECTION')) {
    const objectCitations = concreteCitations(sections.OBJECT);
    if (objectCitations.length !== 1) throw new Error(`${label} Round 2 OBJECT는 NO MATERIAL OBJECTION이 아니면 다른 Agent의 구체 인용을 정확히 1개 포함해야 합니다.`);
    if (objectCitations[0].label.toLowerCase() === agentName.toLowerCase()) throw new Error(`${label} Round 2 OBJECT에서 자기 Agent 주장 ${objectCitations[0].raw}을 대상으로 삼을 수 없습니다.`);
  }
  return sections;
}

function validateIntegrationOutput(content) {
  const { sections, duplicates } = parseSections(content, integrationHeadings);
  if (duplicates.length) throw new Error(`Integration 응답에 중복 섹션이 있습니다: ${[...new Set(duplicates)].join(', ')}`);
  const missing = integrationHeadings.filter((heading) => !Object.hasOwn(sections, heading));
  if (missing.length) throw new Error(`Integration 응답에 필수 섹션이 없습니다: ${missing.join(', ')}`);
  const empty = integrationHeadings.filter((heading) => !sectionCoreText(sections[heading]));
  if (empty.length) throw new Error(`Integration 응답의 섹션 내용이 비었습니다: ${empty.join(', ')}`);
  const nextTest = sectionCoreText(sections['NEXT TEST']);
  if (nextTest === 'NOT RAISED IN TRANSCRIPT' || nextTest === 'NONE OBSERVED IN TRANSCRIPT' || nextTest.length < 8) {
    throw new Error('Integration NEXT TEST는 제목이나 짧은 조각이 아니라 실행 가능한 다음 검증 bullet/문장이어야 합니다.');
  }
  return sections;
}

function agentFromPayload(payload) {
  const instructions = String(payload.instructions || '');
  if (instructions.includes('World Agent')) return 'world';
  if (instructions.includes('Revenue Agent')) return 'revenue';
  if (instructions.includes('Engineering Agent')) return 'engineering';
  if (instructions.includes('Integration Agent')) return 'integration';
  return null;
}

function availableRoundTwoSources(text, agentName) {
  const sources = [];
  for (const match of String(text || '').matchAll(/\[(World|Revenue|Engineering)\s+R([12])\]/g)) {
    if (match[1].toLowerCase() === String(agentName || '').toLowerCase()) continue;
    if (!sources.includes(match[0])) sources.push(match[0]);
  }
  return sources;
}

function hardenInput(input, agentName) {
  let text = String(input || '').replace(/\[(World|Revenue|Engineering) \/ Round ([12])\]/g, '[$1 R$2]');
  text = text.replace(/`\[Agent R1\]`\s*또는\s*`\[Agent R2\]`/g, '`[World R1]`, `[Revenue R1]`, `[Engineering R1]` 등 실제 다른 Agent 출처');
  if (text.includes('[ROUND 2 TASK]')) {
    const self = agentName ? agentName[0].toUpperCase() + agentName.slice(1) : 'Current';
    const allowedSources = availableRoundTwoSources(text, agentName);
    text += `\n\n[ROUND 2 SOURCE RULES — STRICT OUTPUT CONTRACT]\n허용 출처 토큰: ${allowedSources.length ? allowedSources.join(', ') : '(없음)'}\n- ACCEPT는 위 허용 출처 중 정확히 1개를 골라 그 Agent가 transcript에서 실제로 한 주장 1개만 수용하십시오. bullet의 첫 토큰을 반드시 해당 출처로 시작하고, ACCEPT 전체에서 대괄호 출처 토큰을 정확히 1번만 쓰십시오. [${self} R1]/[${self} R2] 자기 Agent 인용은 금지입니다.\n- OBJECT는 위 허용 출처 중 정확히 1개를 골라 실제 주장 1개만 반박/수정하십시오. 반박한다면 bullet의 첫 토큰을 반드시 해당 출처로 시작하고 OBJECT 전체에서 대괄호 출처 토큰을 정확히 1번만 쓰십시오. 실질적 반대가 없으면 bullet 전체를 정확히 \`- NO MATERIAL OBJECTION\`으로 작성하십시오.\n- [Agent R1], [Other Agent], [Specialist] 같은 익명 인용은 금지이며 transcript에 없는 출처나 집단 주장을 만들지 마십시오.\n- DELTA는 자기 Round 1 대비 실제 변경만 쓰고 없으면 bullet 전체를 정확히 \`- NO MATERIAL CHANGE\`로 작성하십시오. DELTA에는 출처 토큰을 반복하지 마십시오.\n- 출처를 설명문 뒤에 붙이지 말고 반드시 bullet 첫 토큰으로 쓰십시오. 같은 출처를 문장 안에서 다시 반복하지 마십시오.\n\n출력은 다른 문장이나 서론 없이 아래 골격만 사용하십시오.\nACCEPT\n- [허용된 다른 Agent 출처 1개] 실제 수용 주장과 이유\nOBJECT\n- [허용된 다른 Agent 출처 1개] 실제 반박 주장과 대안\nDELTA\n- 실제 변경 또는 NO MATERIAL CHANGE`;
  }
  if (text.includes('[INTEGRATION TASK]')) {
    text += '\n\n[INTEGRATION COMPLETENESS RULE]\n8개 기본 섹션은 모두 실제 내용이 있어야 합니다. 근거가 없으면 NOT RAISED IN TRANSCRIPT를 사용할 수 있지만 NEXT TEST에는 사용할 수 없습니다. NEXT TEST는 제목이나 짧은 명사 조각이 아니라 실행 가능한 다음 검증 bullet/문장이어야 합니다.';
  }
  return text;
}

function hardenPayload(payload) {
  const next = { ...payload };
  const agentName = agentFromPayload(next);
  next.input = hardenInput(next.input, agentName);
  if (agentName === 'integration') {
    const configured = Number(process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS || process.env.COUNCIL_MAX_OUTPUT_TOKENS || 1500);
    next.max_output_tokens = Number.isFinite(configured) && configured > 0 ? configured : 1500;
  }
  return { payload: next, agentName };
}

function responseContent(body) {
  return typeof body.output_text === 'string'
    ? body.output_text.trim()
    : (Array.isArray(body.output)
      ? body.output.flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
        .trim()
      : '');
}

async function guardedFetch(resource, options = {}) {
  if (String(resource) !== 'https://api.openai.com/v1/responses' || !options?.body) return realFetch(resource, options);
  apiAttemptCount += 1;
  const parsed = JSON.parse(String(options.body));
  const { payload, agentName } = hardenPayload(parsed);
  const response = await realFetch(resource, { ...options, body: JSON.stringify(payload) });
  const text = await response.text();
  if (response.ok) {
    const body = JSON.parse(text || '{}');
    const content = responseContent(body);
    if (body.status === 'incomplete') {
      throw new Error(`OpenAI 응답이 incomplete 상태입니다. reason=${body.incomplete_details?.reason || 'unknown'}${content ? `\n[PARTIAL OUTPUT]\n${content}` : ''}`);
    }
    try {
      if (agentName === 'integration') validateIntegrationOutput(content);
      else if (agentName && String(payload.input).includes('[ROUND 2 TASK]')) validateRoundTwoOutput(agentName, content);
    } catch (error) {
      throw new Error(`${error.message}\n[REJECTED ${agentName || 'unknown'} OUTPUT]\n${content || '(empty output)'}`);
    }
  }
  return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
}

globalThis.fetch = guardedFetch;
const core = await import('./room-server-core.mjs');
if (isEntrypoint) process.argv[1] = originalArgv1;

const agents = core.agents;
const integrationConfigured = Number(process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS || process.env.COUNCIL_MAX_OUTPUT_TOKENS || 1500);
agents.integration.maxOutputTokens = Number.isFinite(integrationConfigured) && integrationConfigured > 0 ? integrationConfigured : 1500;

function buildAgentInput(meeting, agentName, round) {
  return hardenInput(core.buildAgentInput(meeting, agentName, round), agentName);
}

function buildIntegrationInput(meeting) {
  return hardenInput(core.buildIntegrationInput(meeting), 'integration');
}

function buildResponsePayload(meeting, agentName, round) {
  return hardenPayload(core.buildResponsePayload(meeting, agentName, round)).payload;
}

function validateAgentOutput(agentName, round, content) {
  if (agentName === 'integration') return validateIntegrationOutput(content);
  if (round === 2) return validateRoundTwoOutput(agentName, content);
  return undefined;
}

function getApiAttemptCount() {
  return apiAttemptCount;
}

function resetApiAttemptCount() {
  apiAttemptCount = 0;
}

export {
  agents,
  buildAgentInput,
  core as councilCore,
  buildIntegrationInput,
  buildResponsePayload,
  getApiAttemptCount,
  parseSections,
  resetApiAttemptCount,
  validateAgentOutput,
  validateIntegrationOutput,
  validateRoundTwoOutput,
};
export const buildAgentInstructions = core.buildAgentInstructions;
export const formatMessages = core.formatMessages;
export const runMeeting = core.runMeeting;
