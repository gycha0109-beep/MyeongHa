import { pathToFileURL } from 'node:url';

const DEFAULT_PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const DEFAULT_TIMEOUT_MS = 10_000;

function resolveTimeoutMs(value) {
  const timeoutMs = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Production API verification timeout must be a positive finite number.');
  }
  return timeoutMs;
}

function assertHealthPayload(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.status !== 'ok' ||
    Object.keys(payload).length !== 1
  ) {
    throw new Error('Production API health payload must be exactly {"status":"ok"}.');
  }
}

export async function verifyProductionApiHealth({
  origin = process.env.MYEONGHA_PRODUCTION_ORIGIN ?? DEFAULT_PRODUCTION_ORIGIN,
  timeoutMs = process.env.MYEONGHA_PRODUCTION_VERIFY_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'https:') {
    throw new Error('Production API verification origin must use HTTPS.');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Production API verification requires a fetch implementation.');
  }

  const endpoint = new URL('/api/health', parsedOrigin);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs(timeoutMs));

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status !== 200) {
      throw new Error(`Production API health returned HTTP ${response.status}; expected 200.`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`Production API health returned ${contentType || 'no content-type'}; expected application/json.`);
    }

    const payload = await response.json();
    assertHealthPayload(payload);

    return {
      endpoint: endpoint.href,
      status: response.status,
      payload,
    };
  } finally {
    clearTimeout(timeout);
  }
}

const directInvocation = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (directInvocation) {
  const result = await verifyProductionApiHealth();
  console.log(
    `MyeongHa production API verification passed: ${result.endpoint} -> ${result.status} ${JSON.stringify(result.payload)}`,
  );
}
