/**
 * Launch the actual approved-Saju Owner TEST checkout and purchased-Reading
 * archive on one loopback origin. Never touches the production commerce DB.
 *
 * Required environment variables (secrets are never written to disk):
 * MYEONGHA_SAJU_TEST_MEMBER_DB_URL
 * MYEONGHA_SAJU_TEST_COMMERCE_DB_URL
 * MYEONGHA_SAJU_TEST_STORE_ID
 * MYEONGHA_SAJU_TEST_CHANNEL_KEY
 * MYEONGHA_SAJU_TEST_PORTONE_API_SECRET
 * MYEONGHA_SAJU_TEST_EVIDENCE_HMAC_SECRET
 * MYEONGHA_SUPABASE_API_KEY
 */
import { access } from 'node:fs/promises';
import { createPublicKey } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const webRoot = resolve(root, 'public');
const origin = process.env.MYEONGHA_SAJU_TEST_ORIGIN ?? 'http://127.0.0.1:48721';
const expectedAuthOrigin = 'https://cnsfpcdiyofqvhpcegfc.supabase.co';
const fields = [
  'MYEONGHA_SAJU_TEST_MEMBER_DB_URL', 'MYEONGHA_SAJU_TEST_COMMERCE_DB_URL',
  'MYEONGHA_SAJU_TEST_STORE_ID', 'MYEONGHA_SAJU_TEST_CHANNEL_KEY',
  'MYEONGHA_SAJU_TEST_PORTONE_API_SECRET', 'MYEONGHA_SAJU_TEST_EVIDENCE_HMAC_SECRET',
  'MYEONGHA_SUPABASE_API_KEY',
];
function requireSettings() {
  const missing = fields.filter(name => !process.env[name]?.trim());
  if (missing.length) throw Error('TEST runtime not configured. Missing: ' + missing.join(', '));
}
function parseTestDb(name) {
  const raw = process.env[name];
  const url = new URL(raw);
  const username = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.slice(1));
  // All payment data remains on an explicitly named *local, disposable* DB.
  // No production connection string can be used, even accidentally.
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1'
    || !/^(?:myeongha_saju_sandbox_[a-z0-9_]+)$/u.test(database)
    || !username || !url.password
    || ['postgres', 'supabase_admin', 'service_role'].includes(username)
    || [...url.searchParams.keys()].length) {
    throw Error(name + ' must be a dedicated local TEST PostgreSQL login on 127.0.0.1, with no URL options.');
  }
  return { url, username, database };
}
function requireDistinctRoles(member, merchant) {
  if (member.username === merchant.username || member.database !== merchant.database
    || member.url.port !== merchant.url.port) {
    throw Error('TEST member and merchant roles must be distinct logins in one local sandbox DB.');
  }
}
async function assertRole(pool, expectedLogin, requiredRole, requireCommerceSchema) {
  const { rows } = await pool.query(`
    select current_user::text as login,
      pg_has_role(current_user, $1::name, 'MEMBER') as can_enter_role,
      current_database()::text as database,
      to_regclass('commerce_saju_private.approved_purchase_scope_v1') is not null as has_offers,
      to_regclass('commerce_saju_private.approved_component_reading_v1') is not null as has_archive
  `, [requiredRole]);
  const row = rows[0];
  if (!row || row.login !== expectedLogin || row.can_enter_role !== true
    || row.has_offers !== true || row.has_archive !== true
    || requireCommerceSchema && row.database !== 'myeongha_saju_sandbox_v1') {
    throw Error('Dedicated TEST login / staged 14-offer schema unavailable for role ' + requiredRole + '.');
  }
}
let runtime;
let memberPool;
let commercePool;
let pairReaderPool;
try {
  requireSettings();
  const member = parseTestDb('MYEONGHA_SAJU_TEST_MEMBER_DB_URL');
  const merchant = parseTestDb('MYEONGHA_SAJU_TEST_COMMERCE_DB_URL');
  const pairReader = parseTestDb('MYEONGHA_SAJU_TEST_PAIR_READER_DB_URL');
  requireDistinctRoles(member, merchant);
  if (pairReader.username === member.username || pairReader.username === merchant.username
    || pairReader.database !== member.database || pairReader.url.port !== member.url.port
    || pairReader.url.port !== merchant.url.port) {
    throw Error('T10 pair archive requires an independent local read-only role.');
  }
  const pairPem = Buffer.from(process.env.MYEONGHA_SAJU_PAIR_VERIFY_PEM_B64, 'base64').toString('utf8');
  if (!pairPem.startsWith('-----BEGIN PUBLIC KEY-----') || !pairPem.trimEnd().endsWith('-----END PUBLIC KEY-----')) {
    throw Error('T10 Reader requires pinned Ed25519 PUBLIC proof key.');
  }
  const pairKey = createPublicKey(pairPem);
  if (pairKey.type !== 'public' || pairKey.asymmetricKeyType !== 'ed25519') {
    throw Error('T10 Reader trust must be an Ed25519 public key.');
  }
  await access(resolve(webRoot, 'reading.html'));
  await access(resolve(root, 'dist/apps/api/src/approved-saju-sandbox-owner-runtime-v1.js'));
  const [runtimeModule, paymentModule] = await Promise.all([
    import('../../dist/apps/api/src/approved-saju-sandbox-owner-runtime-v1.js'),
    import('../../dist/apps/api/src/portone-v2-payment-verification-adapter.js'),
  ]);

  // Connection-string parsing is used only for the local role-specific sandbox.
  // These pools never point at the governed Supabase production DB.
  memberPool = new Pool({ connectionString: member.url.href, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, ssl: false });
  commercePool = new Pool({ connectionString: merchant.url.href, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, ssl: false });
  pairReaderPool = new Pool({ connectionString: pairReader.url.href, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, ssl: false });
  await Promise.all([
    assertRole(memberPool, member.username, 'myeongha_api_executor', true),
    assertRole(commercePool, merchant.username, 'myeongha_commerce_internal_executor', true),
    assertRole(pairReaderPool, pairReader.username, 'myeongha_approved_saju_pair_reader_executor', true),
  ]);
  const verificationAdapter = paymentModule.createPortOneV2PaymentVerificationAdapterV1({
    apiSecret: process.env.MYEONGHA_SAJU_TEST_PORTONE_API_SECRET,
    evidenceHmacSecret: process.env.MYEONGHA_SAJU_TEST_EVIDENCE_HMAC_SECRET,
  });
  runtime = runtimeModule.createApprovedSajuSandboxOwnerRuntimeV1({
    origin,
    staticRoot: webRoot,
    supabaseOrigin: expectedAuthOrigin,
    supabaseApiKey: process.env.MYEONGHA_SUPABASE_API_KEY,
    memberPool, commercePool, verificationAdapter,
    pairReader: { pool: pairReaderPool, trust: {
      issuer: process.env.MYEONGHA_SAJU_PAIR_PROOF_ISSUER,
      audience: process.env.MYEONGHA_SAJU_PAIR_PROOF_AUDIENCE,
      keyId: process.env.MYEONGHA_SAJU_PAIR_PROOF_KEY_ID,
      engineVersion: process.env.MYEONGHA_SAJU_ENGINE_VERSION,
      verificationKey: pairKey,
    } },
    channel: {
      environment: 'sandbox',
      storeId: process.env.MYEONGHA_SAJU_TEST_STORE_ID,
      channelKey: process.env.MYEONGHA_SAJU_TEST_CHANNEL_KEY,
    },
  });
  await runtime.start();
  console.log('Saju TEST checkout listening at ' + origin + '/reading.html (Owner access only).');

  let exiting = false;
  const shutdown = async () => {
    if (exiting) return;
    exiting = true;
    try { await runtime.close(); } finally {
      await Promise.allSettled([memberPool.end(), commercePool.end(), pairReaderPool.end()]);
    }
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
} catch (error) {
  await Promise.allSettled([
    runtime?.close(), memberPool?.end(), commercePool?.end(), pairReaderPool?.end(),
  ].filter(Boolean));
  const message = error instanceof Error ? error.message : 'TEST runtime refused to start.';
  console.error('Owner-only Saju TEST startup blocked: ' + message);
  process.exitCode = 1;
}
