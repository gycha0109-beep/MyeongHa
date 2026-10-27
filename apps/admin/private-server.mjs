import { Pool } from 'pg';
import {
  createAdminLoopbackServerV1,
  listenAdminLoopbackV1,
} from '../../dist/apps/api/src/admin-private-loopback-server-v1.js';
import {
  buildProductionPostgresStrictTlsTargetV1,
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
  PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
} from '../../dist/apps/api/src/production-postgres-tls-peer-verification.js';
import {
  MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
} from '../../dist/apps/api/src/production-user-data-runtime-config.js';

const env = process.env;
if (env.MYEONGHA_ADMIN_PRIVATE_ENABLED !== 'true') {
  throw new Error('Private Administrator activation is disabled.');
}
const rootCertificatePem = env.MYEONGHA_ADMIN_DATABASE_SSL_ROOT_CERT_PEM;
if (typeof rootCertificatePem !== 'string' || rootCertificatePem.length === 0) {
  throw new Error('Dedicated Administrator strict TLS root binding is unavailable.');
}

function createRestrictedPool(role, envName) {
  const raw = env[envName];
  if (typeof raw !== 'string') throw new Error('Missing separate admin database role.');
  const parsed = new URL(raw);
  if (decodeURIComponent(parsed.username) !== role) {
    throw new Error('Admin database principal does not match the dedicated role.');
  }
  const target = buildProductionPostgresStrictTlsTargetV1({
    databaseUrl: raw,
    rootCertificatePem,
    authority: {
      contractVersion: PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
      projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
      requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
      rootCertificateFingerprint256: PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1,
    },
  });
  return new Pool({
    connectionString: target.connectionString,
    ssl: target.ssl,
    max: 2,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 5000,
    statement_timeout: 3000,
    allowExitOnIdle: true,
  });
}

const readPool = createRestrictedPool('myeongha_admin_reader', 'MYEONGHA_ADMIN_READ_DATABASE_URL');
const auditPool = createRestrictedPool('myeongha_admin_audit_writer', 'MYEONGHA_ADMIN_AUDIT_DATABASE_URL');
const commandPool = env.MYEONGHA_ADMIN_COMMAND_DATABASE_URL ? createRestrictedPool('myeongha_admin_command_executor','MYEONGHA_ADMIN_COMMAND_DATABASE_URL') : undefined;
const server = createAdminLoopbackServerV1({ env, readPool, auditPool,...(commandPool?{commandPool}:{}) });
const addr = await listenAdminLoopbackV1(server, 4185);
console.info('MyeongHa private admin loopback listening at', addr.address + ':' + addr.port);

async function closeServer() {
  await new Promise(resolve => server.close(resolve));
  await Promise.allSettled([readPool.end(), auditPool.end(),commandPool?.end()]);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void closeServer().finally(() => process.exit(0)); });
}
