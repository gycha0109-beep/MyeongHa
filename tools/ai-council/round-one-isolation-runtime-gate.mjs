const upstreamFetch = globalThis.fetch;
const responsesUrl = 'https://api.openai.com/v1/responses';
const priorMarker = '[PRIOR POSITIONS IN THIS ROUND]';
const isolationBlock = `[ROUND 1 ISOLATION]\n다른 Agent의 같은 Round 발언은 제공되지 않습니다. World, Revenue, Engineering은 Round 1에서 서로 독립적으로 최초 입장을 작성하고, 상호 검토는 Round 2에서만 수행합니다.`;

function isSpecialistRoundOne(payload) {
  const instructions = String(payload?.instructions || '');
  const input = String(payload?.input || '');
  const specialist = instructions.includes('World Agent')
    || instructions.includes('Revenue Agent')
    || instructions.includes('Engineering Agent');
  return specialist && input.includes('[ROUND 1 TASK]');
}

export function isolateRoundOneInput(input) {
  const text = String(input || '');
  const markerIndex = text.indexOf(priorMarker);
  if (markerIndex < 0) return text;
  return `${text.slice(0, markerIndex).trimEnd()}\n\n${isolationBlock}`;
}

async function roundOneIsolationFetch(resource, options = {}) {
  if (String(resource) !== responsesUrl || !options?.body) return upstreamFetch(resource, options);

  const payload = JSON.parse(String(options.body));
  if (!isSpecialistRoundOne(payload)) return upstreamFetch(resource, options);

  const isolated = {
    ...payload,
    input: isolateRoundOneInput(payload.input),
  };
  return upstreamFetch(resource, { ...options, body: JSON.stringify(isolated) });
}

globalThis.fetch = roundOneIsolationFetch;
