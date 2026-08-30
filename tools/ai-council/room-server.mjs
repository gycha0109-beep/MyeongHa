import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.COUNCIL_PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY || '';
const maxContextChars = Number(process.env.COUNCIL_MAX_CONTEXT_CHARS || 24000);
const legacyMaxOutputTokens = Number(process.env.COUNCIL_MAX_OUTPUT_TOKENS || 0);
const specialistReasoningEffort = String(process.env.COUNCIL_SPECIALIST_REASONING_EFFORT || process.env.COUNCIL_REASONING_EFFORT || 'minimal').trim();
const integrationReasoningEffort = String(process.env.COUNCIL_INTEGRATION_REASONING_EFFORT || process.env.COUNCIL_REASONING_EFFORT || 'low').trim();
const meetings = new Map();
const subscribers = new Map();

const roundTwoHeadings = ['ACCEPT', 'OBJECT', 'DELTA'];
const integrationHeadings = ['AGREED', 'CONFLICT', 'REQUIREMENTS', 'DECISION CANDIDATE', 'FAILURE CASES', 'METRICS / VALIDATION', 'OPEN', 'NEXT TEST'];
const concreteCitationPattern = /\[(World|Revenue|Engineering)\s+R([12])\]/gi;
const anonymousCitationPattern = /\[(?:Agent|Other\s+Agent|Specialist)(?:\s+R[12])?\]/i;

function outputLimit(name, fallback) {
  const value = Number(process.env[name] || legacyMaxOutputTokens || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const agents = {
  world: {
    label: 'World',
    model: process.env.COUNCIL_WORLD_MODEL || 'gpt-5-mini',
    maxOutputTokens: outputLimit('COUNCIL_WORLD_MAX_OUTPUT_TOKENS', 800),
    instructions: '당신은 MyeongHa World Agent입니다. Worldbuilding, Character Experience, Narrative, Relationship Experience, character consistency를 검토합니다. 서비스가 아는 것과 캐릭터가 아는 것을 구분하십시오. Relationship, Memory, Narrative Progress를 동일시하지 마십시오. 캐릭터를 상품 판매자처럼 다루지 마십시오. 사용자 경험이 자연스러운지, 캐릭터가 살아 있는 사람처럼 느껴지는지, World/Relationship continuity가 유지되는지, 제품이 CRM·상담봇·판매봇처럼 변하지 않는지를 우선 판단하십시오. Revenue의 경제성은 고려하되 Revenue 최적화가 World 결론의 authority는 아닙니다. 확정되지 않은 정책을 확정된 사실처럼 말하지 마십시오.',
  },
  revenue: {
    label: 'Revenue',
    model: process.env.COUNCIL_REVENUE_MODEL || 'gpt-5-mini',
    maxOutputTokens: outputLimit('COUNCIL_REVENUE_MAX_OUTPUT_TOKENS', 800),
    instructions: '당신은 MyeongHa Revenue Agent입니다. BM, Unit Economics, COGS, Monetization, Retention economics, Artifact conversion을 검토합니다. H-R19 Open / Low-friction Relationship Core + Free Grounded First Value + Explicit Paid Structured Artifacts + Optional Membership + Premium Compute / Cost Control과 H-R20 Longitudinal Value Accumulation을 기준 가설로 참고하십시오. Retention 상승이 실제 monetization으로 이어지는지, COGS가 감당 가능한지, Free-Core Cannibalization이 생기는지, 장기 데이터가 WTP/ARPU를 실제로 올릴 수 있는지를 우선 판단하십시오. World가 재미있다고 해서 경제성이 없는 구조를 감싸지 마십시오. 확정되지 않은 정책을 임의로 확정하지 마십시오.',
  },
  engineering: {
    label: 'Engineering',
    model: process.env.COUNCIL_ENGINEERING_MODEL || 'gpt-5-mini',
    maxOutputTokens: outputLimit('COUNCIL_ENGINEERING_MAX_OUTPUT_TOKENS', 900),
    instructions: '당신은 MyeongHa Engineering Agent입니다. Backend feasibility, runtime architecture, DB authority, LLM orchestration, retrieval, context size, latency, cost observability, security/privacy를 검토합니다. 실제 구현 가능성, state cardinality, authority의 명확성, bounded context/latency/COGS, privacy·data leakage를 우선 판단하십시오. LLM은 proposal/rendering이고 Server가 authority라는 원칙을 지키십시오. relationship state, unlock, entitlement, DB authority state를 LLM이 직접 확정하지 않도록 하십시오. World나 Revenue가 좋은 아이디어라고 해도 구조상 위험하면 명확히 반대하십시오. 프로젝트 파일을 실제로 변경하라는 지시가 없으면 분석만 하십시오.',
  },
  integration: {
    label: 'Integration',
    model: process.env.COUNCIL_INTEGRATION_MODEL || 'gpt-5-mini',
    maxOutputTokens: outputLimit('COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS', 1500),
    instructions: '당신은 MyeongHa Integration Agent입니다. 당신은 4번째 전문가가 아니라 실제 발언을 비교·분류하는 기록자입니다. World, Revenue, Engineering의 정책·가격·DB·Character rule을 새로 창조하거나 authority를 확정하지 마십시오. 모든 분류는 transcript의 실제 주장에만 근거해야 하며, 각 항목에 근거 Agent와 Round를 대괄호로 표시하십시오. 예상되는 입장, 잠재적 갈등, 일반 지식으로 보충한 반론, "World라면 이렇게 생각할 수 있다" 같은 추론은 금지입니다. 실제 충돌은 보존하고, 해소되지 않았으면 OPEN 또는 CONFLICT로 남기십시오. 반드시 한국어로 답하십시오.',
  },
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function publish(meetingId, event, value) {
  const listeners = subscribers.get(meetingId) || new Set();
  const packet = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
  for (const response of listeners) response.write(packet);
}

function addMessage(meeting, agent, content, meta = {}) {
  const message = {
    id: randomUUID(),
    meeting_id: meeting.id,
    agent,
    label: agents[agent]?.label || agent,
    content,
    created_at: new Date().toISOString(),
    ...meta,
  };
  meeting.messages.push(message);
  publish(meeting.id, 'message', message);
  return message;
}

function extractOutput(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const items = Array.isArray(response.output) ? response.output : [];
  return items
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

function truncate(value, limit) {
  const text = String(value || '').trim();
  return text.length <= limit ? text : `${text.slice(0, limit)}\n…(context truncated)`;
}

function formatMessages(messages, { perMessage = 3600, total = maxContextChars } = {}) {
  const parts = [];
  let used = 0;
  for (const message of messages) {
    const header = `[${message.label}${message.round ? ` R${message.round}` : ''}]\n`;
    const part = `${header}${truncate(message.content, perMessage)}`;
    if (used + part.length > total) break;
    parts.push(part);
    used += part.length + 2;
  }
  return parts.join('\n\n');
}

function buildRoundOneInput(meeting) {
  const prior = meeting.messages.filter((message) => message.agent !== 'user');
  return `회의 주제:\n${meeting.topic}\n\n[ROUND 1 TASK]\n당신의 전문영역 책임으로 최초 분석을 제시하십시오. POSITION은 다른 트랙의 우려를 모두 섞은 중립 결론이 아니라, 당�