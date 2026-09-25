const PRODUCTION_SIGNUP_ENDPOINT = 'https://myeongha.vercel.app/api/auth/sign-up';
const EXPECTED_STATUS = 422;
const EXPECTED_ERROR_CODE = 'COMPROMISED_PASSWORD';
const MAX_RESPONSE_BYTES = 64 * 1024;
const FORBIDDEN_SESSION_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'session',
]);

function requireRuntimeAuthority() {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Production password compromise canary must run in GitHub Actions.');
  }
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('Production password compromise canary requires workflow_dispatch.');
  }
  if (process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Production password compromise canary must run from main.');
  }
  if (process.env.MYEONGHA_WATCHTOWER_TRACK !== 'ops') {
    throw new Error('Production password compromise canary requires Watchtower track ops.');
  }
  if (process.env.MYEONGHA_PASSWORD_COMPROMISE_CANARY_CONFIRM !== 'VERIFY_PASSWORD_COMPROMISE_GUARD') {
    throw new Error('Production password compromise canary confirmation mismatch.');
  }
  if (!/^[1-9][0-9]*$/u.test(process.env.GITHUB_RUN_ID ?? '')) {
    throw new Error('Production password compromise canary requires a numeric GitHub run id.');
  }
  if (!/^[1-9][0-9]*$/u.test(process.env.GITHUB_RUN_ATTEMPT ?? '')) {
    throw new Error('Production password compromise canary requires a numeric GitHub run attempt.');
  }
  if (!/^[0-9a-f]{40}$/u.test(process.env.GITHUB_SHA ?? '')) {
    throw new Error('Production password compromise canary requires an exact Git SHA.');
  }
}

function containsForbiddenSessionMaterial(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenSessionMaterial);
  if (value === null || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_SESSION_KEYS.has(key)) return true;
    if (containsForbiddenSessionMaterial(nested)) return true;
  }
  return false;
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Production password compromise canary response exceeded the governed byte limit.');
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Production password compromise canary response body is unavailable.');

  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        throw new Error('Production password compromise canary response exceeded the governed byte limit.');
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('Production password compromise canary response was not valid JSON.');
  }
}

requireRuntimeAuthority();

const compromisedPassword = ['123', '456'].join('');
const syntheticEmail = [
  'password-compromise-canary+',
  process.env.GITHUB_RUN_ID,
  '-',
  process.env.GITHUB_RUN_ATTEMPT,
  '@example.invalid',
].join('');

const response = await fetch(PRODUCTION_SIGNUP_ENDPOINT, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: syntheticEmail,
    password: compromisedPassword,
    next: 'hall.html',
  }),
  cache: 'no-store',
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
});

const payload = await readBoundedJson(response);
const observedErrorCode =
  payload !== null
  && typeof payload === 'object'
  && !Array.isArray(payload)
  && payload.error !== null
  && typeof payload.error === 'object'
  && !Array.isArray(payload.error)
  && typeof payload.error.code === 'string'
    ? payload.error.code
    : null;

const serializedPayload = JSON.stringify(payload);
const sessionMaterialReturned = containsForbiddenSessionMaterial(payload);
const submittedPasswordReturned = serializedPayload.includes(compromisedPassword);

if (response.status !== EXPECTED_STATUS) {
  throw new Error(`Production password compromise canary expected HTTP ${EXPECTED_STATUS} but observed ${response.status}.`);
}
if (observedErrorCode !== EXPECTED_ERROR_CODE) {
  throw new Error('Production password compromise canary did not observe the governed error code.');
}
if (sessionMaterialReturned) {
  throw new Error('Production password compromise canary observed forbidden session material.');
}
if (submittedPasswordReturned) {
  throw new Error('Production password compromise canary observed submitted credential material in the response.');
}

console.log('password_compromise_guard_evidence=pass');
console.log('expected_http_status=422');
console.log('observed_http_status=422');
console.log('expected_error_code=COMPROMISED_PASSWORD');
console.log('observed_error_code=COMPROMISED_PASSWORD');
console.log('plaintext_password_logged=false');
console.log('full_password_hash_logged=false');
console.log('session_material_returned=false');
