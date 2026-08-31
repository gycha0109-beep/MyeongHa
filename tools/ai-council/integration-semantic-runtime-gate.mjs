import { integrationSemanticInstruction, validateIntegrationSemanticEvolution } from './integration-semantic-evolution.mjs';

const upstreamFetch = globalThis.fetch;
const responsesUrl = 'https://api.openai.com/v1/responses';

function isIntegrationPayload(payload) {
  return String(payload?.instructions || '').includes('Integration Agent')
    || String(payload?.input || '').includes('[INTEGRATION TASK]');
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
