// D3e25: least-privilege Supabase key shape policy for public /auth/v1/user.
// This is a local credential-class check, NOT JWT signature verification or
// confirmation of the deployed Supabase API key tier.
export type SupabaseAuthApiKeyClassV1 =
  | 'publishable'
  | 'legacy_anon'
  | 'privileged'
  | 'unrecognized';

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{16,}$/u;
const PRIVILEGED_SECRET_KEY = /^sb_secret_/u;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

export function classifySupabaseAuthApiKeyV1(key: unknown): SupabaseAuthApiKeyClassV1 {
  if (typeof key !== 'string' || key.length < 20 || key.trim() !== key) {
    return 'unrecognized';
  }
  if (PRIVILEGED_SECRET_KEY.test(key)) return 'privileged';
  if (PUBLISHABLE_KEY.test(key)) return 'publishable';
  if (!JWT.test(key) || key.length > 8192) return 'unrecognized';

  // Legacy Supabase anon/service_role project keys are signed JWTs. Their
  // locally decoded role is an HINT only; Supabase verifies the key upstream.
  // Never emit key material, payload or parsing errors to logs.
  try {
    const [rawHeader, rawClaims] = key.split('.');
    if (rawHeader === undefined || rawClaims === undefined) return 'unrecognized';
    const header: unknown = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8'));
    const payload: unknown = JSON.parse(Buffer.from(rawClaims, 'base64url').toString('utf8'));
    if (header === null || typeof header !== 'object' || Array.isArray(header)) {
      return 'unrecognized';
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return 'unrecognized';
    }
    const algorithm = (header as { alg?: unknown }).alg;
    const role = (payload as { role?: unknown }).role;
    if (algorithm !== 'HS256') return 'unrecognized';
    if (role === 'service_role') return 'privileged';
    if (role === 'anon') return 'legacy_anon';
    return 'unrecognized';
  } catch {
    return 'unrecognized';
  }
}

export function isLeastPrivilegeSupabaseAuthApiKeyV1(key: unknown): boolean {
  const classification = classifySupabaseAuthApiKeyV1(key);
  return classification === 'publishable' || classification === 'legacy_anon';
}
