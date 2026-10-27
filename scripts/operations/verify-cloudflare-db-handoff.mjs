// Offline, bounded category-only advisory. No network, secret output or mutations.
// This does not replace the authoritative Worker validators or live DB canary.
// Watchtower-Track: ops
import { pathToFileURL } from 'node:url';

const PROJECT_REF = 'cnsfpcdiyofqvhpcegfc';
const CF_ROLE = 'myeongha_cf_api_login';
const APPROVED_MODE = 'approved-auth-db-v1';
const APPROVED_TLS_RLS = 'approved-isolated-tls-rls-v1';
const SUPABASE_ORIGIN = `https://${PROJECT_REF}.supabase.co`;

function report(code, passed = false) {
  return Object.freeze({
    result: passed ? 'CONFIG_CONTRACT_PASS' : 'HOLD',
    code,
    liveDatabaseVerified: false,
    workerDeployed: false,
  });
}
export function verifyCloudflareDbHandoffV1(env = {}) {
  const origin = env.MYEONGHA_CLOUDFLARE_AUTH_ORIGIN;
  if (env.MYEONGHA_CLOUDFLARE_AUTH_DB_MODE !== APPROVED_MODE ||
      env.MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL !== APPROVED_TLS_RLS) {
    return report('AUTH_DB_STAGE5_NOT_ADMITTED');
  }
  if (origin !== 'https://myeongha.gycha0109.workers.dev') {
    return report('AUTH_ORIGIN_NOT_PINNED');
  }
  if (env.MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN !== origin) {
    return report('AUTH_ORIGIN_NOT_APPROVED');
  }
  const approvedHost = env.MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST;
  const approvedPort = env.MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT;
  if (typeof approvedHost !== 'string' ||
      !/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}$/u.test(approvedHost) ||
      /\.(?:localhost|local|internal|invalid|test|example)$/u.test(approvedHost) ||
      typeof approvedPort !== 'string' ||
      !/^[1-9][0-9]{0,4}$/u.test(approvedPort) ||
      Number(approvedPort) > 65535) {
    return report('AUTH_DB_STAGE5_NOT_ADMITTED');
  }
  if (env.MYEONGHA_DATABASE_PRINCIPAL !== CF_ROLE) {
    return report('DB_PRINCIPAL_NOT_DEDICATED_CF_API_LOGIN');
  }
  const raw = env.MYEONGHA_DATABASE_URL;
  if (typeof raw !== 'string' || raw.trim() !== raw ||
      env.MYEONGHA_DATABASE_TLS_PEER_MODE !== 'verify-full' ||
      typeof env.MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM !== 'string' ||
      env.MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM.trim().length === 0 ||
      env.MYEONGHA_SUPABASE_URL !== SUPABASE_ORIGIN ||
      typeof env.MYEONGHA_SUPABASE_API_KEY !== 'string' ||
      env.MYEONGHA_SUPABASE_API_KEY.length < 20 ||
      typeof env.MYEONGHA_GUEST_FINGERPRINT_SECRET !== 'string' ||
      env.MYEONGHA_GUEST_FINGERPRINT_SECRET.length < 32) {
    return report('PRODUCTION_DB_CONFIG_INVALID');
  }
  let parsed;
  try { parsed = new URL(raw); } catch { return report('DB_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !parsed.username || !parsed.password ||
      !['require', 'verify-full'].includes(parsed.searchParams.get('sslmode'))) {
    return report('PRODUCTION_DB_CONFIG_INVALID');
  }
  const pooler = approvedHost.endsWith('.pooler.supabase.com');
  const login = CF_ROLE + (pooler ? '.' + PROJECT_REF : '');
  try {
    if (decodeURIComponent(parsed.username) !== login) {
      return report('DB_LOGIN_NOT_DEDICATED_CF_API_LOGIN');
    }
  } catch { return report('DB_URL_INVALID'); }
  if (parsed.hostname !== approvedHost) return report('DB_HOST_NOT_APPROVED');
  if (parsed.port !== approvedPort) return report('DB_PORT_NOT_APPROVED');
  if (pooler && parsed.pathname !== '/postgres') return report('DB_TENANT_PATH_INVALID');
  return report('CONFIG_ONLY_NO_NETWORK_PROOF', true);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyCloudflareDbHandoffV1(process.env);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.result !== 'CONFIG_CONTRACT_PASS') process.exitCode = 2;
}
