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
} = {}) {
  const binding = validateAdminAccessConfigurationV1(config);
  return async (request: Request): Promise<boolean> => {
    try {
      const token = request.headers.get('cf-access-jwt-assertion');
      if (token === null || token.length > 16_384) return false;
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const header = decodePart(parts[0]!); const claims = decodePart(parts[1]!);
      if (!object(header) || !object(claims) || header.alg !== 'RS256' ||
          typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/u.test(header.kid)) return false;
      const now = Math.floor((options.now ?? Date.now)() / 1000);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== binding.issuer || !audiences.includes(binding.audience) ||
          typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
          (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)) ||
          (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat > now + 30)) ||
          typeof claims.email !== 'string' || claims.email.toLowerCase() !== binding.ownerEmail) return false;
      const signal = AbortSignal.timeout(3000);
      const response = await (options.fetchImpl ?? fetch)(binding.issuer + '/cdn-cgi/access/certs', {
        redirect: 'error', signal, headers: { Accept: 'application/json' }, cache: 'no-store',
      });
      if (!response.ok) return false;
      const jwks: unknown = JSON.parse(await readBoundedUpstreamJsonTextV1(response, { maximumBodyBytes: 65_536, signal }));
      if (!object(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 20) return false;
      const keys = jwks.keys.filter((key: unknown) => object(key) && key.kid === header.kid && key.kty === 'RSA' &&
        (key.use === undefined || key.use === 'sig') && (key.alg === undefined || key.alg === 'RS256'));
      if (keys.length !== 1 || !/^[A-Za-z0-9_-]+$/u.test(parts[2]!)) return false;
      const key = await crypto.subtle.importKey('jwk', keys[0] as JsonWebKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(parts[2]!, 'base64url'),
        new TextEncoder().encode(parts[0] + '.' + parts[1]));
    } catch { return false; }
  };
}
