const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const SIGN_IN_URL = `${PRODUCTION_ORIGIN}/api/auth/sign-in`;
const REQUEST_TIMEOUT_MS = 15_000;

function requireCredential(name, { trim = true } = {}) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required for the production Member smoke session.`);
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length === 0) {
    throw new Error(`${name} is required for the production Member smoke session.`);
  }
  return normalized;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNoStore(response) {
  const directives = (response.headers.get('cache-control') ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean);
  if (!directives.includes('no-store')) {
    throw new Error('Production Member smoke sign-in must return Cache-Control containing no-store.');
  }
}

function requireJsonContentType(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('Production Member smoke sign-in must return application/json.');
  }
}

async function readJsonWithoutLogging(response) {
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error('Production Member smoke sign-in did not return valid JSON.');
  }
  if (!isRecord(value)) {
    throw new Error('Production Member smoke sign-in returned a non-object JSON body.');
  }
  return value;
}

export async function acquireProductionMemberSmokeSession() {
  const email = requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL');
  const password = requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false });

  const response = await fetch(SIGN_IN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  requireNoStore(response);
  requireJsonContentType(response);
  if (response.status !== 200) {
    throw new Error(`Production Member smoke sign-in expected HTTP 200, received ${response.status}.`);
  }

  const body = await readJsonWithoutLogging(response);
  if (body.ok !== true || !isRecord(body.data) || body.data.status !== 'authenticated') {
    throw new Error('Production Member smoke sign-in did not return an authenticated data envelope.');
  }
  const session = body.data.session;
  if (!isRecord(session)) {
    throw new Error('Production Member smoke sign-in did not return a session object.');
  }
  const accessToken = session.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0 || /[\s,]/u.test(accessToken)) {
    throw new Error('Production Member smoke sign-in returned an invalid access token.');
  }

  return Object.freeze({ accessToken });
}
