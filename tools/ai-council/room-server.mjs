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
const meetings = new Map();
const subscribers = new Map();

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
    maxOutputTokens: outputLimit('COUNCIL_INTEGRATION_MAX_OUTPUT_TOKENS', 1400),
    instructions: '당신은 MyeongHa Integration Agent입니다. 당신은 4번째 전문가가 아니라 실제 발언을 비교·분류하는 기록자입니다. World, Revenue, Engineering의 정책·가격·DB·Character rule을 새로 창조하거나 authority를 확정하지 마십시오. 모든 분류는 transcript의 실제 주장에만 근거해야 하며, 각 항목에 근거 Agent와 Round를 대괄호로 표시하십시오. 예상되는 입장, 잠재적 갈등, 일반 지식으로 보충한 반론, "World라면 이렇게 생각할 수 있다" 같은 추론은 금지입니다. 실제 충돌은 보존하고, 해소되지 않았으면 OPEN 또는 CONFLICT로 남기십시오.',
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
    const header = `[${message.label}${message.round ? ` / Round ${message.round}` : ''}]\n`;
    const part = `${header}${truncate(message.content, perMessage)}`;
    if (used + part.length > total) break;
    parts.push(part);
    used += part.length + 2;
  }
  return parts.join('\n\n');
}

function buildRoundOneInput(meeting) {
  const prior = meeting.messages.filter((message) => message.agent !== 'user');
  return `회의 주제:\n${meeting.topic}\n\n[ROUND 1 TASK]\n당신의 전문영역 책임으로 최초 분석을 제시하십시오. 다른 Agent의 앞선 발언이 있으면 참고하되 그 의견에 맞추기 위해 자기 전문영역의 판단을 포기하지 마십시오. 아직 확정하지 말고, 실제 trade-off와 상대 트랙에 요구할 조건을 분명히 하십시오.\n\n권장 구조:\nPOSITION\n- 현재 입장\n\nREASONS\n- 핵심 근거\n\nRISKS\n- 전문영역 관점의 가장 큰 위험\n\nREQUIREMENTS FOR OTHER TRACKS\n- 상대 트랙에 요구하는 조건\n\nOPEN\n- 아직 판단할 수 없는 것\n\n[PRIOR POSITIONS IN THIS ROUND]\n${formatMessages(prior, { perMessage: 3000, total: 9000 }) || '(아직 다른 전문 Agent 발언 없음)'}`;
}

function buildRoundTwoInput(meeting, agentName) {
  const ownRoundOne = meeting.messages.find((message) => message.agent === agentName && message.round === 1);
  const otherRoundOne = meeting.messages.filter((message) => message.round === 1 && message.agent !== agentName && message.agent !== 'user');
  const roundTwoDevelopments = meeting.messages.filter((message) => message.round === 2 && message.agent !== agentName);
  return `회의 주제:\n${meeting.topic}\n\n[YOUR ROUND 1 POSITION]\n${ownRoundOne ? formatMessages([ownRoundOne], { perMessage: 4600, total: 4600 }) : '(없음)'}\n\n[OTHER AGENTS' ROUND 1 POSITIONS]\n${formatMessages(otherRoundOne, { perMessage: 3900, total: 12000 }) || '(없음)'}\n\n[ROUND 2 DEVELOPMENTS]\n${formatMessages(roundTwoDevelopments, { perMessage: 3200, total: 6000 }) || '(아직 없음)'}\n\n[ROUND 2 TASK]\nRound 1 답변을 요약하거나 표현만 바꿔 반복하지 마십시오. 핵심은 다른 Agent의 실제 주장 이후 생긴 입장 변화입니다. 합의가 Round 2의 목적이 아니며, 자기 전문영역의 책임을 유지하십시오. 아래 정확한 형식으로 작성하십시오.\n\nACCEPT\n- 다른 Agent의 주장 중 가장 강하게 수용하는 것 1개와 짧은 이유\n\nOBJECT\n- 다른 Agent의 주장 중 가장 강하게 반대하거나 수정해야 하는 것 1개, 반대 이유와 대안\n- 실질적인 반대가 정말 없다면 정확히 \`NO MATERIAL OBJECTION\`이라고 작성\n\nDELTA\n- 위 검토 때문에 Round 1 자기 제안에서 실제로 변경된 내용만 작성\n- 변경이 없다면 \`NO MATERIAL CHANGE\`라고 작성\n\n다른 Agent의 실제 주장에 근거해 수용·반박·조건부 수용 중 하나를 수행하십시오.`;
}

function buildIntegrationInput(meeting) {
  const transcript = formatMessages(meeting.messages.filter((message) => message.agent !== 'integration'), { perMessage: 3600, total: maxContextChars });
  return `회의 주제:\n${meeting.topic}\n\n[ACTUAL TRANSCRIPT]\n${transcript || '(전문 Agent 발언 없음)'}\n\n[INTEGRATION TASK]\nTranscript에 실제로 확인되는 주장만 분류하십시오. 항목마다 근거 Agent와 Round를 \`[World R2]\`처럼 표시하십시오.\n\nAGREED는 다음 중 하나일 때만 작성하십시오.\nA. 최소 2개 Agent가 명시적으로 같은 방향을 수용했을 때\nB. 한 Agent의 제안에 다른 Agent들이 Round 2에서 명시적으로 objection하지 않았을 때\n누구도 말하지 않은 내용을 상식적으로 타당하다고 판단해 AGREED로 만들면 안 됩니다.\n\nCONFLICT는 최소 두 Agent의 실제 주장이 양립하지 않을 때만 작성하십시오. 강조점이 다르다는 이유만으로 conflict로 만들면 안 됩니다. 각 conflict는 다음 형태를 따르십시오.\n1. 논점\nWorld: 실제 주장 요약 [World R1/R2]\nRevenue: 실제 주장 요약 [Revenue R1/R2]\nEngineering: 실제 주장 요약 [Engineering R1/R2]\nStatus: unresolved 또는 partially resolved in Round 2\n\n실제 충돌이 없으면 CONFLICT에 \`NONE OBSERVED IN TRANSCRIPT\`라고 작성하십시오.\n\n기본 출력 형식은 다음입니다. 사용자가 회의 주제에서 별도 출력 형식을 명시한 경우 그 형식을 우선하되, grounding 규칙은 항상 지키십시오.\n\nAGREED\n\nCONFLICT\n\nREQUIREMENTS\n\nDECISION CANDIDATE\n\nFAILURE CASES\n\nMETRICS / VALIDATION\n\nOPEN\n\nNEXT TEST\n\nFAILURE CASES와 METRICS / VALIDATION도 transcript에서 실제로 제기된 위험·검증만 기록하십시오. 근거가 없으면 \`NOT RAISED IN TRANSCRIPT\`라고 작성하십시오. 긴 재서술은 금지하고 핵심 결정·실제 충돌·통합 요구·미해결점·다음 검증만 간결하게 작성하십시오.`;
}

function buildAgentInput(meeting, agentName, round) {
  if (agentName === 'integration') return buildIntegrationInput(meeting);
  return round === 1 ? buildRoundOneInput(meeting) : buildRoundTwoInput(meeting, agentName);
}

function buildAgentInstructions(agentName, round) {
  const agent = agents[agentName];
  const webSearchRule = '웹 검색을 사용했다면 답변 마지막에 핵심 출처를 URL과 함께 짧게 적으십시오.';
  if (agentName === 'integration') return `${agent.instructions}\n${webSearchRule}`;
  const phaseRule = round === 1
    ? '한국어로 간결하게 답하고, 요청된 Round 1 구조를 따르십시오.'
    : '한국어로 간결하게 답하고, ACCEPT / OBJECT / DELTA 세 제목을 반드시 모두 사용하십시오.';
  return `${agent.instructions}\n${phaseRule}\n${webSearchRule}`;
}

function validateAgentOutput(agentName, round, content) {
  if (agentName === 'integration' || round !== 2) return;
  const missing = ['ACCEPT', 'OBJECT', 'DELTA'].filter((heading) => !new RegExp(`(^|\\n)\\s*#*\\s*${heading}\\b`, 'i').test(content));
  if (missing.length) throw new Error(`${agents[agentName].label} Round 2 응답에 필수 섹션이 없습니다: ${missing.join(', ')}`);
}

async function callAgent(meeting, agentName, round) {
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  const agent = agents[agentName];
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: agent.model,
      instructions: buildAgentInstructions(agentName, round),
      input: buildAgentInput(meeting, agentName, round),
      max_output_tokens: agent.maxOutputTokens,
      ...(meeting.webSearch ? { tools: [{ type: 'web_search' }] } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const content = extractOutput(body);
  if (!content) throw new Error(`OpenAI 응답에 출력 텍스트가 없습니다. status=${body.status || 'unknown'}, reason=${body.incomplete_details?.reason || 'unknown'}`);
  validateAgentOutput(agentName, round, content);
  return { content, model: body.model || agent.model, request_id: body.id || null, usage: body.usage || null, latency_ms: Date.now() - startedAt, max_output_tokens: agent.maxOutputTokens };
}

async function runMeeting(meeting) {
  try {
    addMessage(meeting, 'user', meeting.topic);
    const debatingAgents = meeting.agents.filter((agentName) => agentName !== 'integration');
    for (let round = 1; round <= meeting.maxRounds; round += 1) {
      for (const agentName of debatingAgents) {
        if (meeting.calls >= meeting.maxAgentCalls) break;
        meeting.currentAgent = agentName;
        publish(meeting.id, 'status', { agent: agentName, round, status: 'thinking' });
        const result = await callAgent(meeting, agentName, round);
        meeting.calls += 1;
        meeting.usage.push({ agent: agentName, round, model: result.model, request_id: result.request_id, usage: result.usage, latency_ms: result.latency_ms, max_output_tokens: result.max_output_tokens });
        addMessage(meeting, agentName, result.content, { round, model: result.model, usage: result.usage, latency_ms: result.latency_ms, max_output_tokens: result.max_output_tokens });
        publish(meeting.id, 'status', { agent: agentName, round, status: 'completed' });
      }
    }
    if (meeting.agents.includes('integration') && meeting.calls < meeting.maxAgentCalls) {
      const round = meeting.maxRounds + 1;
      meeting.currentAgent = 'integration';
      publish(meeting.id, 'status', { agent: 'integration', round, status: 'thinking' });
      const result = await callAgent(meeting, 'integration', round);
      meeting.calls += 1;
      meeting.usage.push({ agent: 'integration', round, model: result.model, request_id: result.request_id, usage: result.usage, latency_ms: result.latency_ms, max_output_tokens: result.max_output_tokens });
      addMessage(meeting, 'integration', result.content, { round, model: result.model, usage: result.usage, latency_ms: result.latency_ms, max_output_tokens: result.max_output_tokens });
      publish(meeting.id, 'status', { agent: 'integration', round, status: 'completed' });
    }
    meeting.status = 'completed';
    publish(meeting.id, 'done', { meeting_id: meeting.id, calls: meeting.calls, usage: meeting.usage });
  } catch (error) {
    meeting.status = 'failed';
    meeting.error = `${meeting.currentAgent || 'unknown'}: ${error.message}`;
    publish(meeting.id, 'error', { message: error.message });
  }
}

async function serveStatic(response) {
  const file = await fs.readFile(path.join(root, 'public', 'index.html'));
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(file);
}

async function readBody(request) {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || '{}');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/') return serveStatic(response);
    if (request.method === 'GET' && url.pathname.startsWith('/api/meetings/') && url.pathname.endsWith('/events')) {
      const meetingId = url.pathname.split('/')[3];
      if (!meetings.has(meetingId)) return sendJson(response, 404, { error: 'Meeting not found' });
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
      if (!subscribers.has(meetingId)) subscribers.set(meetingId, new Set());
      subscribers.get(meetingId).add(response);
      response.write(': connected\n\n');
      const meeting = meetings.get(meetingId);
      for (const message of meeting.messages) response.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      if (meeting.status === 'completed') response.write(`event: done\ndata: ${JSON.stringify({ meeting_id: meeting.id, calls: meeting.calls, usage: meeting.usage })}\n\n`);
      if (meeting.status === 'failed') response.write(`event: error\ndata: ${JSON.stringify({ message: meeting.error })}\n\n`);
      request.on('close', () => subscribers.get(meetingId)?.delete(response));
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/meetings') {
      const input = await readBody(request);
      const topic = String(input.topic || '').trim();
      if (!topic) return sendJson(response, 400, { error: 'topic is required' });
      const requestedAgents = Array.isArray(input.agents) ? input.agents.filter((agent) => agents[agent]) : Object.keys(agents);
      const meeting = {
        id: randomUUID(),
        topic: topic.slice(0, 12000),
        agents: requestedAgents.length ? requestedAgents : ['world'],
        maxRounds: Math.max(1, Math.min(Number(input.maxRounds || 2), 3)),
        maxAgentCalls: Math.max(1, Math.min(Number(input.maxAgentCalls || (requestedAgents.filter((agentName) => agentName !== 'integration').length * 2 + (requestedAgents.includes('integration') ? 1 : 0) || 1)), 10)),
        webSearch: input.webSearch === true,
        calls: 0,
        status: 'running',
        messages: [],
        usage: [],
        created_at: new Date().toISOString(),
      };
      meetings.set(meeting.id, meeting);
      sendJson(response, 202, { meeting_id: meeting.id, agents: meeting.agents, max_agent_calls: meeting.maxAgentCalls });
      void runMeeting(meeting);
      return;
    }
    if (request.method === 'GET') return serveStatic(response);
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`MyeongHa Council Room: http://127.0.0.1:${port}`);
  });
}

export { agents, buildAgentInput, buildAgentInstructions, buildIntegrationInput, formatMessages, runMeeting, validateAgentOutput };
