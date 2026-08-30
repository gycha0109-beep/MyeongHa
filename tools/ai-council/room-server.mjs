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

function hardenInput(input, agentName) {
  let text = String(input || '').replace(/\[(World|Revenue|Engineering) \/ Round ([12])\]/g, '[$1 R$2]');
  if (text.includes('[ROUND 2 TASK]')) {
    const self = agentName ? agentName[0].toUpperCase() + agentName.slice(1) : 'Current';
    text += `\n\n[ROUND 2 SOURCE RULES]\n- ACCEPT는 다른 Agent의 실제 주장 정확히 1개만 수용하고 [World R1] 같은 구체 출처를 정확히 1개 인용하십시오. [${self} R1]/[${self} R2] 자기 Agent 인용은 금지입니다.\n- OBJECT는 다른 Agent의 실제 주장 정확히 1개를 반박/수정하고 구체 출처를 정확히 1개 인용하십시오. 반박이 없으면 정확히 NO MATERIAL OBJECTION만 작성하십시오.\n- [Agent R1], [Other Agent] 같은 익명 인용은 금지이며 존재하지 않는 집단 주장도 금지입니다.\n- DELTA는 자기 Round 1 대비 실제 변경만 쓰고 없으면 정확히 NO MATERIAL CHANGE라고 작성하십시오.`;
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

async function guardedFetch(resource, options = {}) {
  if (String(resource) !== 'https://api.openai.com/v1/responses' || !options?.body) return realFetch(resource, options);
  const parsed = JSON.parse(String(options.body));
  const { payload, agentName } = hardenPayload(parsed);
  const response = await realFetch(resource, { ...options, body: JSON.stringify(payload) });
  const text = await response.text();
  if (response.ok) {
    const body = JSON.parse(text || '{}');
    if (body.status === 'incomplete') throw new Error(`OpenAI 응답이 incomplete 상태입니다. reason=${body.incomplete_details?.reason || 'unknown'}`);
    const content = typeof body.output_text === 'string' ? body.output_text.trim() : (Array.isArray(body.output) ? body.output.flatMap((item) => Array.isArray(item.content) ? item.content : []).filter((item) => item.type === 'output_text' && typeof item.text === 'string').map((item) => item.text).join('\n').trim() : '');
    if (agentName === 'integration') validateIntegrationOutput(content);
    else if (agentName && String(payload.input).includes('[ROUND 2 TASK]')) validateRoundTwoOutput(agentName, content);
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

export {
  agents,
  buildAgentInput,
  core as councilCore,
  buildIntegrationInput,
  buildResponsePayload,
  parseSections,
  validateAgentOutput,
  validateIntegrationOutput,
  validateRoundTwoOutput,
};
export const buildAgentInstructions = core.buildAgentInstructions;
export const formatMessages = core.formatMessages;
export const runMeeting = core.runMeeting;
