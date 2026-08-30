import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.COUNCIL_PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY || '';
const meetings = new Map();
const subscribers = new Map();

const agents = {
  world: {
    label: 'World',
    model: process.env.COUNCIL_WORLD_MODEL || 'gpt-5-mini',
    instructions: '당신은 MyeongHa World Agent입니다. Worldbuilding, Character Experience, Narrative, Relationship Experience, character consistency를 검토합니다. 서비스가 아는 것과 캐릭터가 아는 것을 구분하십시오. Relationship, Memory, Narrative Progress를 동일시하지 마십시오. 캐릭터를 상품 판매자처럼 다루지 마십시오. 다른 트랙의 의견을 존중하되 World 관점의 위험과 요구사항을 분명히 제시하십시오. 확정되지 않은 정책을 확정된 사실처럼 말하지 마십시오. 한국어로 답하고 결론, 근거, 리스크, 다음 검증 항목 순서를 사용하십시오.',
  },
  revenue: {
    label: 'Revenue',
    model: process.env.COUNCIL_REVENUE_MODEL || 'gpt-5-mini',
    instructions: '당신은 MyeongHa Revenue Agent입니다. BM, Unit Economics, COGS, Monetization, Retention economics, Artifact conversion을 검토합니다. H-R19 Open / Low-friction Relationship Core + Free Grounded First Value + Explicit Paid Structured Artifacts + Optional Membership + Premium Compute / Cost Control과 H-R20 Longitudinal Value Accumulation을 기준 가설로 참고하십시오. Free-Core Cannibalization을 반드시 점검하십시오. 한국어로 답하고 경제적 전제, 수익 기회, 비용·리스크, 검증 항목 순서를 사용하십시오. 확정되지 않은 정책을 임의로 확정하지 마십시오.',
  },
  engineering: {
    label: 'Engineering',
    model: process.env.COUNCIL_ENGINEERING_MODEL || 'gpt-5-mini',
    instructions: '당신은 MyeongHa Engineering Agent입니다. Backend feasibility, runtime architecture, DB authority, LLM orchestration, retrieval, context size, latency, cost observability, security/privacy를 검토합니다. LLM은 proposal/rendering이고 Server가 authority라는 원칙을 지키십시오. relationship state, unlock, entitlement, DB authority state를 LLM이 직접 확정하지 않도록 하십시오. 한국어로 답하고 구현 가능성, 구조적 리스크, 비용·보안 영향, 최소 구현안을 순서대로 제시하십시오. 프로젝트 파일을 실제로 변경하라는 지시가 없으면 분석만 하십시오.',
  },
  integration: {
    label: 'Integration',
    model: process.env.COUNCIL_INTEGRATION_MODEL || 'gpt-5-mini',
    instructions: '당신은 MyeongHa Integration Agent입니다. 앞선 Agent의 의견을 AGREED, CONFLICT, REQUIREMENTS, OPEN, DECISION CANDIDATE, NEXT TEST로 구조화하십시오. World, Revenue, Engineering 정책을 새로 창조하지 마십시오. 의견을 하나로 뭉개지 말고 충돌을 보존하십시오. 결정 후보는 가장 안전한 통합안으로 표현하고, 실제 프로젝트 authority를 자동 변경하지 마십시오. 한국어로 간결하게 답하십시오.',
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

function boundedTranscript(meeting) {
  return meeting.messages
    .slice(-8)
    .map((message) => `[${message.label}]\n${message.content}`)
    .join('\n\n')
    .slice(-18000);
}

async function callAgent(meeting, agentName, round) {
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  const agent = agents[agentName];
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: agent.model,
      instructions: agent.instructions,
      input: `회의 주제:\n${meeting.topic}\n\n현재 라운드: ${round}/${meeting.maxRounds}\n\n현재까지의 회의 발언:\n${boundedTranscript(meeting) || '(아직 다른 발언 없음)'}\n\n당신의 차례입니다. 앞선 Agent의 발언을 읽고, 동의·반박·수정안을 분명히 밝히십시오. ${round > 1 ? '이번 라운드는 앞선 라운드에 대한 재검토입니다.' : '이번 라운드는 최초 분석입니다.'} 웹 검색을 사용했다면 답변 마지막에 핵심 출처를 URL과 함께 짧게 적으십시오.`,
      max_output_tokens: Number(process.env.COUNCIL_MAX_OUTPUT_TOKENS || 700),
      ...(meeting.webSearch ? { tools: [{ type: 'web_search' }] } : {}),
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const content = extractOutput(body);
  if (!content) throw new Error('OpenAI가 빈 응답을 반환했습니다.');
  return {
    content,
    model: body.model || agent.model,
    request_id: body.id || null,
    usage: body.usage || null,
    latency_ms: Date.now() - startedAt,
  };
}

async function runMeeting(meeting) {
  try {
    addMessage(meeting, 'user', meeting.topic);
    const debatingAgents = meeting.agents.filter((agentName) => agentName !== 'integration');
    for (let round = 1; round <= meeting.maxRounds; round += 1) {
      for (const agentName of debatingAgents) {
        if (meeting.calls >= meeting.maxAgentCalls) break;
        publish(meeting.id, 'status', { agent: agentName, round, status: 'thinking' });
        const result = await callAgent(meeting, agentName, round);
        meeting.calls += 1;
        meeting.usage.push({
          agent: agentName,
          round,
          model: result.model,
          request_id: result.request_id,
          usage: result.usage,
          latency_ms: result.latency_ms,
        });
        addMessage(meeting, agentName, result.content, {
          round,
          model: result.model,
          usage: result.usage,
          latency_ms: result.latency_ms,
        });
        publish(meeting.id, 'status', { agent: agentName, round, status: 'completed' });
      }
    }
    if (meeting.agents.includes('integration') && meeting.calls < meeting.maxAgentCalls) {
      const round = meeting.maxRounds + 1;
      publish(meeting.id, 'status', { agent: 'integration', round, status: 'thinking' });
      const result = await callAgent(meeting, 'integration', round);
      meeting.calls += 1;
      meeting.usage.push({
        agent: 'integration',
        round,
        model: result.model,
        request_id: result.request_id,
        usage: result.usage,
        latency_ms: result.latency_ms,
      });
      addMessage(meeting, 'integration', result.content, {
        round,
        model: result.model,
        usage: result.usage,
        latency_ms: result.latency_ms,
      });
      publish(meeting.id, 'status', { agent: 'integration', round, status: 'completed' });
    }
    meeting.status = 'completed';
    publish(meeting.id, 'done', { meeting_id: meeting.id, calls: meeting.calls, usage: meeting.usage });
  } catch (error) {
    meeting.status = 'failed';
    meeting.error = error.message;
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

server.listen(port, '127.0.0.1', () => {
  console.log(`MyeongHa Council Room: http://127.0.0.1:${port}`);
});
