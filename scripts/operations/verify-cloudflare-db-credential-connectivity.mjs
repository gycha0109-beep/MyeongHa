// Read-only DB authentication and TLS/RLS role canary. Never log a DSN,
// password, SQL errors, server responses or any business/subject data.
// Watchtower-Track: ops
import { X509Certificate } from 'node:crypto';
import { verifyCloudflareDbHandoffV1 } from './verify-cloudflare-db-handoff.mjs';

export const DEDICATED_CF_LOGIN = 'myeongha_cf_api_login';
const APPROVED_ROOT_CA_FINGERPRINT256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
export const CF_LOGIN_READONLY_SQL = [
  'SELECT current_user AS login_role,',
  'r.rolbypassrls AS bypassrls, r.rolsuper AS superuser,',
  'r.rolcanlogin AS canlogin,',
  "pg_has_role(current_user, 'myeongha_api_executor', 'member') AS executor_member",
  'FROM pg_roles r WHERE r.rolname = current_user',
].join(' ');

function result(code, passed = false) {
  return Object.freeze({
    result: passed ? 'DB_AUTHENTICATED_READ_ONLY' : 'HOLD',
    code,
    readOnlyQueryVerified: passed,
    dbWritesPerformed: false,
    workerDeployed: false,
  });
}
export function verifyCloudflareDbRootCaV1(pem, now = Date.now()) {
  try {
    const x509 = new X509Certificate(pem);
    return x509.ca && x509.fingerprint256 === APPROVED_ROOT_CA_FINGERPRINT256 &&
      Date.parse(x509.validFrom) <= now &&
      now < Date.parse(x509.validTo) &&
      typeof pem === 'string' &&
      pem.includes('-----BEGIN CERTIFICATE-----') &&
      !pem.includes('PRIVATE KEY');
  } catch { return false; }
}
export async function verifyCloudflareDbCredentialConnectionV1(env, {
  clientFactory,
  validateRoot = verifyCloudflareDbRootCaV1,
} = {}) {
  if (verifyCloudflareDbHandoffV1(env).result !== 'CONFIG_CONTRACT_PASS') {
    return result('DB_CONNECTION_CONTRACT_REJECTED');
  }
  if (!validateRoot(env.MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM)) {
    return result('DB_TLS_ROOT_INVALID');
  }
  let client;
  try {
    // Explicit Node TLS CA + peer-hostname validation must not be silently
    // overridden by sslmode/sslrootcert URL search parameters.
    const url = new URL(env.MYEONGHA_DATABASE_URL);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('sslrootcert');
    const options = {
      connectionString: url.toString(),
      ssl: {
        ca: env.MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM,
        rejectUnauthorized: true,
        servername: url.hostname,
      },
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      statement_timeout: 5000,
    };
    if (clientFactory) client = await clientFactory(options);
    else {
      const { Client } = await import('pg');
      client = new Client(options);
    }
    await client.connect();
    const answer = await client.query(CF_LOGIN_READONLY_SQL);
    const rows = answer?.rows;
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (row?.login_role !== DEDICATED_CF_LOGIN ||
        row?.bypassrls !== false ||
        row?.superuser !== false ||
        row?.canlogin !== true ||
        row?.executor_member !== true) {
      return result('DB_LOGIN_OR_RLS_AUTHORITY_MISMATCH');
    }
    return result('DB_LOGIN_TLS_RLS_READ_ONLY_VERIFIED', true);
  } catch {
    return result('DB_CONNECTION_OR_AUTH_FAILED');
  } finally {
    if (client) {
      try { await client.end(); } catch { /* do not expose connection details */ }
    }
  }
}
