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
const integrationGroundedSections = ['AGREED', 'CONFLICT', 'REQUIREMENTS', 'DECISION CANDIDATE', 'FAILURE CASES', 'METRICS / VALIDATION', 'OPEN', 'NEXT TEST'];
const integrationAgentLabels = ['World', 'Revenue', 'Engineering'];
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

function integrationCitationTokens(value) {
  return [...String(value || '').matchAll(/\[(World|Revenue|Engineering)[^\]\r\n]*\]/gi)].map((match) => match[0]);
}

function integrationItems(value) {
  const items = [];
  let current = [];
  for (const line of String(value || '').split(/\r?\n/)) {
    if (/^[-*+]\s+\S/.test(line)) {
      if (current.length) items.push(current.join('\n').trim());
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) items.push(current.join('\n').trim());
  return items;
}

function transcriptText(source) {
  if (typeof source === 'string') {
    const raw = String(source || '');
    const startMarker = '[ACTUAL TRANSCRIPT]';
    const taskMarker = '[INTEGRATION TASK]';
    const start = raw.indexOf(startMarker);
    if (start < 0) return raw;
    const from = start + startMarker.length;
    const end = raw.indexOf(taskMarker, from);
    return raw.slice(from, end >= 0 ? end : undefined).trim();
  }
  if (!source || !Array.isArray(source.messages)) return '';
  return source.messages
    .filter((message) => ['world', 'revenue', 'engineering'].includes(message.agent) && [1, 2].includes(message.round))
    .map((message) => `[${message.label || message.agent} R${message.round}]\n${message.content || ''}`)
    .join('\n\n');
}

function sourceMessageMap(source) {
  const map = new Map();
  if (source && typeof source !== 'string' && Array.isArray(source.messages)) {
    for (const message of source.messages) {
      if (!['world', 'revenue', 'engineering'].includes(message.agent) || ![1, 2].includes(message.round)) continue;
      const label = message.label || (message.agent[0].toUpperCase() + message.agent.slice(1));
      map.set(`${label} R${message.round}`, String(message.content || ''));
    }
    return map;
  }

  let current = null;
  for (const line of transcriptText(source).split(/\r?\n/)) {
    const match = line.trim().match(/^\[(World|Revenue|Engineering)\s+R([12])\]$/);
    if (match) {
      current = `${match[1]} R${match[2]}`;
      if (!map.has(current)) map.set(current, '');
      continue;
    }
    if (current) map.set(current, `${map.get(current)}${map.get(current) ? '\n' : ''}${line}`);
  }
  return map;
}

function availableSourceRounds(source) {
  return new Set(sourceMessageMap(source).keys());
}

function citedAgentRounds(item) {
  const cited = new Set();
  for (const citation of concreteCitations(item)) cited.add(`${citation.label} R${citation.round}`);
  return cited;
}

function stripBullet(line) {
  return String(line || '').trim().replace(/^[-*+]\s+/, '');
}

function attributedAgents(item) {
  const text = String(item || '').replace(/\[(World|Revenue|Engineering)\s+R[12]\]/gi, '');
  const agents = new Set();
  for (const line of text.split(/\r?\n/)) {
    const lineOwner = stripBullet(line).match(/^(World|Revenue|Engineering)\s*:/i);
    if (lineOwner) agents.add(integrationAgentLabels.find((label) => label.toLowerCase() === lineOwner[1].toLowerCase()));
  }
  const attributionPattern = /((?:World|Revenue|Engineering)(?:\s*\/\s*(?:World|Revenue|Engineering))*)(?:\s+R[12])?\s*(?:대안|제안|주장|입장|수용|반대|요구|delta|방향)/gi;
  for (const match of text.matchAll(attributionPattern)) {
    for (const part of match[1].split('/').map((value) => value.trim())) {
      const label = integrationAgentLabels.find((candidate) => candidate.toLowerCase() === part.toLowerCase());
      if (label) agents.add(label);
    }
  }
  return [...agents];
}

function conflictAgentLines(item) {
  return String(item || '').split(/\r?\n/).map((line) => stripBullet(line)).map((line) => {
    const match = line.match(/^(World|Revenue|Engineering)\s*:\s*(.+)$/i);
    if (!match) return null;
    const label = integrationAgentLabels.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase());
    return { label, text: match[2] };
  }).filter(Boolean);
}

function normalizedEvidence(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isExactSentinel(value, sentinel) {
  return sectionCoreText(value).toUpperCase() === sentinel;
}

function integrationOutputLimit() {
  const configured = Number(process.env.COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS || 0);
  return Number.isFinite(configured) && configured > 0 ? configured : 3000;
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

  const malformedCitations = integrationCitationTokens(content).filter(
    (token) => !/^\[(World|Revenue|Engineering)\s+R[12]\]$/i.test(token),
  );
  if (malformedCitations.length) {
    throw new Error(`Integration 응답에 모호하거나 잘못된 citation이 있습니다: ${[...new Set(malformedCitations)].join(', ')}. [World R1]처럼 Agent와 Round를 하나씩 정확히 인용해야 합니다.`);
  }

  const nextLines = String(sections['NEXT TEST'] || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nextTest = sectionCoreText(sections['NEXT TEST']);
  if (nextTest === 'NOT RAISED IN TRANSCRIPT' || nextTest === 'NONE OBSERVED IN TRANSCRIPT' || nextTest.length < 8) {
    throw new Error('Integration NEXT TEST는 제목이나 짧은 조각이 아니라 실행 가능한 다음 검증 bullet이어야 합니다.');
  }
  if (nextLines.some((line) => !/^[-*+]\s+\S/.test(line))) {
    throw new Error('Integration NEXT TEST에는 bullet 외의 꼬리 텍스트나 형식 밖 문장을 둘 수 없습니다.');
  }
  if (nextLines.some((line) => sectionCoreText(line).length < 8)) {
    throw new Error('Integration NEXT TEST의 각 bullet은 실행 가능한 완결 문장이어야 합니다.');
  }
  return sections;
}

function validateIntegrationGrounding(source, content) {
  const sections = validateIntegrationOutput(content);
  const messages = sourceMessageMap(source);
  const available = new Set(messages.keys());

  for (const heading of integrationGroundedSections) {
    for (const item of integrationItems(sections[heading])) {
      if (isExactSentinel(item, 'NONE OBSERVED IN TRANSCRIPT') || isExactSentinel(item, 'NOT RAISED IN TRANSCRIPT')) continue;
      const citations = citedAgentRounds(item);
      if (!citations.size) throw new Error(`Integration ${heading}의 각 실제 항목은 최소 1개의 구체 citation을 포함해야 합니다.`);
      for (const agent of attributedAgents(item)) {
        const hasAgentCitation = [...citations].some((citation) => citation.startsWith(`${agent} R`));
        if (!hasAgentCitation) {
          throw new Error(`Integration ${heading} 항목이 ${agent}를 주장 주체로 명시했지만 같은 항목에 ${agent} citation이 없습니다.`);
        }
      }
    }
  }

  if (!isExactSentinel(sections.CONFLICT, 'NONE OBSERVED IN TRANSCRIPT')) {
    for (const item of integrationItems(sections.CONFLICT)) {
      const citations = citedAgentRounds(item);
      for (const agent of attributedAgents(item)) {
        if (available.has(`${agent} R2`) && !citations.has(`${agent} R2`)) {
          throw new Error(`Integration CONFLICT가 ${agent}의 현재 충돌 입장을 다루면서 최신 [${agent} R2]를 인용하지 않았습니다. R1은 역사적 근거로만 단독 사용하면 안 됩니다.`);
        }
      }
      for (const line of conflictAgentLines(item)) {
        const lineCitations = concreteCitations(line.text).filter((citation) => citation.label === line.label);
        if (!lineCitations.length) throw new Error(`Integration CONFLICT의 ${line.label}: 줄에는 같은 Agent의 citation이 필요합니다.`);
        const evidence = line.text.match(/EVIDENCE\s+"([^"]{8,})"/i)?.[1];
        if (!evidence) throw new Error(`Integration CONFLICT의 ${line.label}: 줄에는 EVIDENCE "원문 구절"이 필요합니다.`);
        const normalized = normalizedEvidence(evidence);
        const supported = lineCitations.some((citation) => {
          const sourceContent = messages.get(`${citation.label} R${citation.round}`);
          return sourceContent && normalizedEvidence(sourceContent).includes(normalized);
        });
        if (!supported) throw new Error(`Integration CONFLICT의 ${line.label} EVIDENCE가 cited transcript 원문과 일치하지 않습니다.`);
      }
    }
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
  text = text.replace(/\[(World|Revenue|Engineering) R1\/R2\]/g, '[$1 R1] 또는 [$1 R2]');
  if (text.includes('[ROUND 2 TASK]')) {
    const self = agentName ? agentName[0].toUpperCase() + agentName.slice(1) : 'Current';
    const allowedSources = availableRoundTwoSources(text, agentName);
    text += `\n\n[ROUND 2 SOURCE RULES — STRICT OUTPUT CONTRACT]\n허용 출처 토큰: ${allowedSources.length ? allowedSources.join(', ') : '(없음)'}\n- ACCEPT는 위 허용 출처 중 정확히 1개를 골라 그 Agent가 transcript에서 실제로 한 주장 1개만 수용하십시오. bullet의 첫 토큰을 반드시 해당 출처로 시작하고, ACCEPT 전체에서 대괄호 출처 토큰을 정확히 1번만 쓰십시오. [${self} R1]/[${self} R2] 자기 Agent 인용은 금지입니다.\n- OBJECT는 위 허용 출처 중 정확히 1개를 골라 실제 주장 1개만 반박/수정하십시오. 반박한다면 bullet의 첫 토큰을 반드시 해당 출처로 시작하고 OBJECT 전체에서 대괄호 출처 토큰을 정확히 1번만 쓰십시오. 실질적 반대가 없으면 bullet 전체를 정확히 \`- NO MATERIAL OBJECTION\`으로 작성하십시오.\n- [Agent R1], [Other Agent], [Specialist] 같은 익명 인용은 금지이며 transcript에 없는 출처나 집단 주장을 만들지 마십시오.\n- DELTA는 자기 Round 1 대비 실제 변경만 쓰고 없으면 bullet 전체를 정확히 \`- NO MATERIAL CHANGE\`로 작성하십시오. DELTA에는 출처 토큰을 반복하지 마십시오.\n- 출처를 설명문 뒤에 붙이지 말고 반드시 bullet 첫 토큰으로 쓰십시오. 같은 출처를 문장 안에서 다시 반복하지 마십시오.\n\n출력은 다른 문장이나 서론 없이 아래 골격만 사용하십시오.\nACCEPT\n- [허용된 다른 Agent 출처 1개] 실제 수용 주장과 이유\nOBJECT\n- [허용된 다른 Agent 출처 1개] 실제 반박 주장과 대안\nDELTA\n- 실제 변경 또는 NO MATERIAL CHANGE`;
  }
  if (text.includes('[INTEGRATION TASK]')) {
    text += '\n\n[INTEGRATION STRICT OUTPUT CONTRACT]\n- citation은 반드시 [World R1], [World R2], [Revenue R1], [Revenue R2], [Engineering R1], [Engineering R2] 중 하나를 하나씩 사용하십시오. [Revenue R1/R2] 같은 slash 축약 citation은 금지입니다. 여러 Round가 근거면 [Revenue R1], [Revenue R2]처럼 각각 적으십시오.\n- 모든 실제 bullet/block은 최소 1개의 구체 citation을 포함하십시오. NONE OBSERVED IN TRANSCRIPT와 NOT RAISED IN TRANSCRIPT sentinel만 예외입니다.\n- CONFLICT에서 어떤 Agent에게 Round 2 발언이 있으면 현재 unresolved/partially resolved 상태를 설명할 때 그 Agent의 [Agent R2]를 반드시 포함하십시오. R1은 역사적 배경으로 함께 쓸 수 있지만 최신 입장의 단독 근거가 될 수 없습니다.\n- CONFLICT의 World:/Revenue:/Engineering: 각 줄은 `Agent: 요약 | EVIDENCE "transcript 원문에서 그대로 복사한 8자 이상 구절" [Agent R1 또는 R2]` 형식을 사용하십시오. Agent 줄 앞에 들여쓴 `- ` bullet을 붙여도 같은 conflict block으로 처리됩니다. EVIDENCE는 cited source에 실제로 존재하는 연속 원문이어야 합니다.\n- 어떤 bullet/block에서 World, Revenue, Engineering을 제안자·지지자·반대자·대안의 주체로 직접 이름 붙이면 같은 항목에 해당 Agent citation을 반드시 넣으십시오. 예: Engineering/Revenue 대안이라고 쓰려면 Engineering과 Revenue 각각의 실제 근거 citation이 모두 필요합니다.\n- 원문의 강도를 키우지 마십시오. "유료 전환 경로가 필요"를 "반드시 유료로만 제공"처럼 더 강한 배타적 주장으로 바꾸면 안 됩니다.\n- 8개 기본 섹션은 모두 실제 내용이 있어야 합니다. 근거가 없으면 NOT RAISED IN TRANSCRIPT를 사용할 수 있지만 NEXT TEST에는 사용할 수 없습니다.\n- NEXT TEST의 모든 내용 줄은 반드시 `- `로 시작하는 실행 가능한 bullet이어야 합니다. 마지막 NEXT TEST bullet 뒤에는 ORIGIN, NOTE, 설명, 맺음말 등 어떤 추가 텍스트도 출력하지 마십시오.\n- 전체 답변은 NEXT TEST의 마지막 bullet에서 즉시 종료하십시오.';
  }
  return text;
}

function hardenPayload(payload) {
  const next = { ...payload };
  const agentName = agentFromPayload(next);
  next.input = hardenInput(next.input, agentName);
  if (agentName === 'integration') next.max_output_tokens = integrationOutputLimit();
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
      if (agentName === 'integration') validateIntegrationGrounding(payload.input, content);
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
agents.integration.maxOutputTokens = integrationOutputLimit();

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
  validateIntegrationGrounding,
  validateIntegrationOutput,
  validateRoundTwoOutput,
};
export const buildAgentInstructions = core.buildAgentInstructions;
export const formatMessages = core.formatMessages;
export const runMeeting = core.runMeeting;
