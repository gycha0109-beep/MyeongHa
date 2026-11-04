import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';

export interface AdminAccessConfigurationV1 {
  readonly issuer: string;
  readonly audience: string;
  readonly ownerEmail: string;
}
function decodePart(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/u.test(part)) throw new Error('Invalid Access token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validateAdminAccessConfigurationV1(config: AdminAccessConfigurationV1) {
  const issuer = new URL(config.issuer);
  if (issuer.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/u.test(issuer.hostname) ||
      issuer.pathname !== '/' || issuer.search || issuer.hash || issuer.username || issuer.password ||
      !/^[a-f0-9]{64}$/iu.test(config.audience) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(config.ownerEmail)) {
    throw new Error('Private Admin Access configuration is incomplete.');
  }
  return { issuer: issuer.origin, audience: config.audience, ownerEmail: config.ownerEmail.toLowerCase() };
}

/** Verify the Access signature even when static-asset routing has no ctx.access. */
export function createAdminAccessGateV1(config: AdminAccessConfigurationV1, options: {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  /** Only fixed, nonsensitive reason codes. Never logs raw identity or credentials. */
  readonly onDenied?: (reason: string) => void;
} = {}) {
  const binding = validateAdminAccessConfigurationV1(config);
  const deny = (reason: string): false => {
    try { options.onDenied?.(reason); } catch { /* Diagnostics never affect the gate. */ }
    return false;
  };
  return async (request: Request): Promise<boolean> => {
    let stage = 'claims_decode';
    let keyRequestSignal: AbortSignal | undefined;
    try {
      // Hostname-based Access browser sessions may arrive via CF_Authorization
      // rather than the origin assertion header. Both paths MUST verify the
      // SAME signed application JWT, audience, expiry and exact Owner claim.
      const assertion = request.headers.get('cf-access-jwt-assertion');
      const cookie = assertion === null ? request.headers.get('cookie') : null;
      const cookieParts = cookie?.split(';') ?? [];
      const authorizationCookies = cookieParts
        .map(part => part.trim())
        .filter(part => part.startsWith('CF_Authorization='));
      if (assertion === null && authorizationCookies.length !== 1) return deny('credential_missing_or_ambiguous');
      const token = assertion ?? authorizationCookies[0]!.slice('CF_Authorization='.length);
      if (!token || token.length > 16_384) return deny('credential_invalid_size');
      const parts = token.split('.');
      if (parts.length !== 3) return deny('credential_invalid_format');
      const header = decodePart(parts[0]!); const claims = decodePart(parts[1]!);
      if (!object(header) || !object(claims) || header.alg !== 'RS256' ||
          typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(header.kid)) return deny('header_invalid');
      const now = Math.floor((options.now ?? Date.now)() / 1000);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== binding.issuer) return deny('issuer_mismatch');
      if (!audiences.includes(binding.audience)) return deny('audience_mismatch');
      if (typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
          (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)) ||
          (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat > now + 30))) return deny('token_time_invalid');
      if (typeof claims.email !== 'string' || claims.email.toLowerCase() !== binding.ownerEmail)
        return deny('owner_claim_invalid');
      // Allow a bounded remote signing-key lookup; the previous 3s deadline
      // can reject valid Access users when the key endpoint is slow.
      stage = 'key_fetch';
      keyRequestSignal = AbortSignal.timeout(8000);
      const response = await (options.fetchImpl ?? fetch)(binding.issuer + '/cdn-cgi/access/certs', {
        redirect: 'error', signal: keyRequestSignal, headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      if (!response.ok) return deny('signing_keys_unavailable');
      stage = 'key_body';
      const bodyText = await readBoundedUpstreamJsonTextV1(response, { maximumBodyBytes: 65_536, signal: keyRequestSignal });
      stage = 'key_json';
      const jwks: unknown = JSON.parse(bodyText);
      if (!object(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 20) return deny('signing_keys_invalid');
      const keys = jwks.keys.filter((key: unknown) => object(key) && key.kid === header.kid && key.kty === 'RSA' &&
        (key.use === undefined || key.use === 'sig') && (key.alg === undefined || key.alg === 'RS256'));
      if (keys.length !== 1 || !/^[A-Za-z0-9_-]+$/u.test(parts[2]!)) return deny('signing_key_or_signature_invalid');
      stage = 'key_import';
      const key = await crypto.subtle.importKey('jwk', keys[0] as JsonWebKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      stage = 'signature_verify';
      const signed=await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(parts[2]!, 'base64url'),
        new TextEncoder().encode(parts[0] + '.' + parts[1]));
      return signed || deny('signature_invalid');
    } catch {
      // The categories are fixed strings, never exception messages, URLs,
      // credentials, claims or signing-key contents.
      if (keyRequestSignal?.aborted && ['key_fetch', 'key_body'].includes(stage))
        return deny('signing_keys_timeout');
      if (stage === 'key_fetch') return deny('signing_keys_fetch_exception');
      if (stage === 'key_body') return deny('signing_keys_body_exception');
      if (stage === 'key_json') return deny('signing_keys_json_exception');
      if (stage === 'key_import') return deny('signing_keys_import_exception');
      if (stage === 'signature_verify') return deny('signature_verify_exception');
      return deny('verification_exception');
    }
  };
}
