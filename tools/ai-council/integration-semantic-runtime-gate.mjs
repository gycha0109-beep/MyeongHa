import { integrationSemanticInstruction, validateIntegrationSemanticEvolution } from './integration-semantic-evolution.mjs';

const upstreamFetch = globalThis.fetch;
const responsesUrl = 'https://api.openai.com/v1/responses';
const priorRoundOneMarker = '[PRIOR POSITIONS IN THIS ROUND]';
const roundOneIsolationBlock = `[ROUND 1 ISOLATION]\n다른 Agent의 같은 Round 발언은 제공되지 않습니다. World, Revenue, Engineering은 Round 1에서 서로 독립적으로 최초 입장을 작성하고, 상호 검토는 Round 2에서만 수행합니다.`;

function isIntegrationPayload(payload) {
  return String(payload?.instructions || '').includes('Integration Agent')
    || String(payload?.input || '').includes('[INTEGRATION TASK]');
}

function isSpecialistRoundOnePayload(payload) {
  const instructions = String(payload?.instructions || '');
  const input = String(payload?.input || '');
  const specialist = instructions.includes('World Agent')
    || instructions.includes('Revenue Agent')
    || instructions.includes('Engineering Agent');
  return specialist && input.includes('[ROUND 1 TASK]');
}

export function isolateRoundOneInput(input) {
  const text = String(input || '');
  const markerIndex = text.indexOf(priorRoundOneMarker);
  if (markerIndex < 0) return text;
  return `${text.slice(0, markerIndex).trimEnd()}\n\n${roundOneIsolationBlock}`;
}

function hardenSemanticInput(input) {
  const text = String(input || '');
  if (text.includes('[INTEGRATION SEMANTIC EVOLUTION RULE]')) return text;
  return `${text}\n\n${integrationSemanticInstruction()}`;
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

async function semanticRuntimeFetch(resource, options = {}) {
  if (String(resource) !== responsesUrl || !options?.body) return upstreamFetch(resource, options);

  const parsed = JSON.parse(String(options.body));
  if (isSpecialistRoundOnePayload(parsed)) {
    const isolated = {
      ...parsed,
      input: isolateRoundOneInput(parsed.input),
    };
    return upstreamFetch(resource, { ...options, body: JSON.stringify(isolated) });
  }

  if (!isIntegrationPayload(parsed)) return upstreamFetch(resource, options);

  const payload = {
    ...parsed,
    input: hardenSemanticInput(parsed.input),
  };
  const response = await upstreamFetch(resource, { ...options, body: JSON.stringify(payload) });
  const text = await response.text();

  if (response.ok) {
    const body = JSON.parse(text || '{}');
    const content = responseContent(body);
    if (body.status !== 'incomplete') {
      try {
        validateIntegrationSemanticEvolution(payload.input, content);
      } catch (error) {
        throw new Error(`${error.message}\n[REJECTED integration OUTPUT]\n${content || '(empty output)'}`);
      }
    }
  }

  return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
}

globalThis.fetch = semanticRuntimeFetch;
