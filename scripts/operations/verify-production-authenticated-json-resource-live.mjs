import { acquireProductionMemberSmokeSession } from '../production-member-smoke-session.mjs';

const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const BIRTH_URL = `${PRODUCTION_ORIGIN}/api/birth-profiles`;
const CHAT_URL = `${PRODUCTION_ORIGIN}/api/chat`;
const REQUEST_TIMEOUT_MS = 15_000;
const CONFIRMATION = 'VERIFY_AUTHENTICATED_JSON_RESOURCE_BOUND';
const TRACK = 'ops';

function requireEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function requireAuthority() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Production resource evidence must run in GitHub Actions.');
  }
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Production resource evidence requires workflow_dispatch.');
  }
  if (process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Production resource evidence requires refs/heads/main.');
  }
  if (requireEnv('MYEONGHA_WATCHTOWER_TRACK') !== TRACK) {
    throw new Error('Production resource evidence requires the ops track.');
  }
  if (requireEnv('MYEONGHA_AUTHENTICATED_JSON_RESOURCE_CONFIRM') !== CONFIRMATION) {
    throw new Error('Production resource evidence confirmation is invalid.');
  }
  if (!/^[0-9a-f]{40}$/u.test(requireEnv('GITHUB_SHA'))) {
    throw new Error('Production resource evidence requires an exact Git SHA.');
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNoStore(response, label) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!directives.includes('no-store')) {
    throw new Error(`${label} did not return Cache-Control: no-store.`);
  }
}

async function probe(label, url, body, bearer) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  requireNoStore(response, label);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${label} did not return JSON.`);
  }

  if (
    response.status !== 413 ||
    !isRecord(payload) ||
    payload.ok !== false ||
    !isRecord(payload.error) ||
    payload.error.code !== 'REQUEST_TOO_LARGE'
  ) {
    throw new Error(`${label} did not return the governed 413 resource rejection.`);
  }

  return Object.freeze({
    status: response.status,
    code: payload.error.code,
  });
}

requireAuthority();
const { accessToken: bearer } = await acquireProductionMemberSmokeSession();

const birthBody = JSON.stringify({
  label: 'resource-canary',
  input: {
    calendarType: 'solar',
    birthDate: '2000-01-01',
    birthTime: null,
    timeKnown: false,
    isLeapMonth: false,
    sex: 'unspecified',
  },
  padding: 'x'.repeat(17_000),
});
const chatBody = JSON.stringify({
  characterId: 'x'.repeat(17_000),
});

const birth = await probe('Birth Profile create resource probe', BIRTH_URL, birthBody, bearer);
const chat = await probe('Chat open resource probe', CHAT_URL, chatBody, bearer);

console.log('authenticated_json_resource_evidence=pass');
console.log('maximum_body_bytes=16384');
console.log('birth_expected_http_status=413');
console.log(`birth_observed_http_status=${birth.status}`);
console.log('birth_expected_error_code=REQUEST_TOO_LARGE');
console.log(`birth_observed_error_code=${birth.code}`);
console.log('chat_expected_http_status=413');
console.log(`chat_observed_http_status=${chat.status}`);
console.log('chat_expected_error_code=REQUEST_TOO_LARGE');
console.log(`chat_observed_error_code=${chat.code}`);
console.log('request_body_logged=false');
console.log('credential_logged=false');
