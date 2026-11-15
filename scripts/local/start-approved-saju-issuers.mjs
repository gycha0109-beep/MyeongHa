/**
 * Dedicated official-Saju issue-job consumer.
 *
 * The already server-verified PortOne receipt emits approved_saju.reading_requested
 * jobs through the existing Commerce ledger. Only the existing SQL issuer
 * worker can claim these paid jobs; neither this CLI nor a browser creates them.
 *
 * Local isolated candidate only. Production deployment and its separate
 * issuer / Reader credentials remain independently gated.
 */
import { createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const root = resolve(repo, 'dist/apps/api/src');
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u;
const selfComponents = ['career', 'business', 'wealth', 'relationship', 'year', 'month'];

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Missing isolated issuer setting: ' + name);
  }
  return value;
}

function dbConnection(variable) {
  const value = new URL(required(variable));
  const user = decodeURIComponent(value.username);
  const database = decodeURIComponent(value.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(value.protocol)
    || value.hostname !== '127.0.0.1' || value.password.length < 8
    || !/^[a-z][a-z0-9_]{2,62}$/u.test(user)
    || !/^myeongha_saju_sandbox_[a-z0-9_]+$/u.test(database)
    || value.search !== '' || value.hash !== '') {
    throw new Error(variable + ' must point to a dedicated isolated local Saju database.');
  }
  return { href: value.href, database, user, port: value.port };
}

function proofKey(name) {
  const value = required(name);
  const pem = Buffer.from(value, 'base64').toString('utf8');
  if (!pem.startsWith('-----BEGIN PUBLIC KEY-----') ||
      !pem.trimEnd().endsWith('-----END PUBLIC KEY-----')) {
    throw new Error('Source proof trust must contain a pinned PUBLIC key only.');
  }
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519' || key.type !== 'public') {
    throw new Error('Only a pinned Ed25519 public Source key may authorize issued Readings.');
  }
  return key;
}

function releases() {
  const input = JSON.parse(required('MYEONGHA_SAJU_ISSUER_RELEASES_JSON'));
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== selfComponents.length
    || selfComponents.some(component =>
      !input[component] || Object.keys(input[component]).length !== 2 ||
      !NAME.test(input[component].releaseRef) ||
      typeof input[component].readerCharacterId !== 'string')) {
    throw new Error('Exact six-component official release mapping is required.');
  }
  return input;
}

async function assertRole(pool, user, role) {
  const { rows } = await pool.query(`
    select current_user::text as login,
      pg_has_role(current_user, $1::name, 'MEMBER') as allowed,
      to_regclass('commerce_saju_private.approved_purchase_scope_v1') is not null as offers,
      to_regprocedure('public.cmd_claim_approved_saju_issue_job_v1(uuid,jsonb)') is not null as queue
  `, [role]);
  const row = rows[0];
  if (!row || row.login !== user || !row.allowed || !row.offers || !row.queue) {
    throw new Error('Isolated paid issuer role or approved offer/queue schema is not installed.');
  }
}

let issuerPool, pairReaderPool, runner;
let shutdownPromise;
// If source signing, the lease authority or its database fails AFTER startup,
// the issuer must EXIT. The supervising checkout process then closes payments.
function shutdown(failed = false) {
  if (failed) process.exitCode = 1;
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    try {
      await runner?.close();
    } catch {
      process.exitCode = 1;
    } finally {
      await Promise.allSettled([issuerPool?.end(), pairReaderPool?.end()].filter(Boolean));
    }
  })();
  return shutdownPromise;
}
try {
  if (required('MYEONGHA_SAJU_ISSUER_STAGE') !== 'local-only') {
    throw new Error('Official Saju paid issuance is not activated for a production database.');
  }
  const issuerDb = dbConnection('MYEONGHA_SAJU_ISSUER_DB_URL');
  const readerDb = dbConnection('MYEONGHA_SAJU_PAIR_READER_DB_URL');
  if (issuerDb.database !== readerDb.database || issuerDb.port !== readerDb.port
    || issuerDb.user === readerDb.user) {
    throw new Error('Issuer and independent pair Reader must use distinct roles on the same staged DB.');
  }
  const sourceOrigin = required('MYEONGHA_SAJU_SOURCE_ORIGIN');
  const pairSourceOrigin = required('MYEONGHA_SAJU_PAIR_SOURCE_ORIGIN');
  if (![sourceOrigin, pairSourceOrigin].every(origin => {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'https:';
  })) throw new Error('Both signed Saju sources must use explicit HTTPS origins.');

  const engineKey = required('MYEONGHA_SAJU_ENGINE_KEY');
  const engineVersion = required('MYEONGHA_SAJU_ENGINE_VERSION');
  const self = {
    baseUrl: sourceOrigin,
    bearerToken: required('MYEONGHA_SAJU_SOURCE_TOKEN'),
    authorityHash: required('MYEONGHA_SAJU_SOURCE_AUTHORITY_HASH'),
    issuer: required('MYEONGHA_SAJU_SOURCE_PROOF_ISSUER'),
    audience: required('MYEONGHA_SAJU_SOURCE_PROOF_AUDIENCE'),
    keyId: required('MYEONGHA_SAJU_SOURCE_KEY_ID'),
    verificationKey: proofKey('MYEONGHA_SAJU_SOURCE_VERIFY_PEM_B64'),
  };
  const pairTrust = {
    issuer: required('MYEONGHA_SAJU_PAIR_PROOF_ISSUER'),
    audience: required('MYEONGHA_SAJU_PAIR_PROOF_AUDIENCE'),
    keyId: required('MYEONGHA_SAJU_PAIR_PROOF_KEY_ID'),
    engineVersion,
    verificationKey: proofKey('MYEONGHA_SAJU_PAIR_VERIFY_PEM_B64'),
  };
  const componentReleases = releases();
  const pairReleaseRef = required('MYEONGHA_SAJU_PAIR_RELEASE_REF');
  if (!NAME.test(pairReleaseRef)) throw new Error('Invalid pinned pair release.');

  issuerPool = new Pool({
    connectionString: issuerDb.href, ssl: false, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000,
  });
  pairReaderPool = new Pool({
    connectionString: readerDb.href, ssl: false, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000,
  });
  await Promise.all([
    assertRole(issuerPool, issuerDb.user, 'myeongha_approved_saju_issuer_executor'),
    assertRole(pairReaderPool, readerDb.user, 'myeongha_approved_saju_pair_reader_executor'),
  ]);

  const runnerModule = await import(resolve(root, 'approved-saju-paid-issuance-runner-v1.js'));
  // Both workers consume only verified payment-origin jobs authorized by SQL.
  // This isolates Source dispatch from the checkout process and browser input.
  runner = runnerModule.createApprovedSajuPaidIssuanceRunnerV1({
    self: {
      pool: issuerPool, source: self, releases: componentReleases,
      engineKey, engineVersion,
    },
    pair: {
      pool: issuerPool,
      pairReaderPool,
      sourceOrigin: pairSourceOrigin,
      sourceBearerToken: required('MYEONGHA_SAJU_PAIR_SOURCE_TOKEN'),
      trust: pairTrust,
      releaseRef: pairReleaseRef,
      readerCharacterId: required('MYEONGHA_SAJU_PAIR_READER_ID'),
      engineKey, engineVersion,
    },
    onCycle: result => {
      if (result.attempted) {
        console.log('Official issue cycle: ' + JSON.stringify(result));
      }
    },
    onError: () => {
      console.error('Paid Saju issuance stopped after a source/DB authority error.');
      // Closing both pools releases the process so the supervised checkout
      // shuts down rather than continuing to take paid orders without issuing.
      void shutdown(true);
    },
  });
  const first = await runner.runOnce();
  console.log('Initial authorized issue cycle: ' + JSON.stringify(first));
  if (process.argv.includes('--serve')) {
    runner.start();
    console.log('Isolated paid-issuance consumer active; no public sales routes enabled.');
    process.once('SIGINT', () => { void shutdown(); });
    process.once('SIGTERM', () => { void shutdown(); });
  } else {
    await shutdown();
  }
} catch (error) {
  console.error('Paid Saju issuer cannot start without approved staged authority: ' +
    (error instanceof Error ? error.message : 'unknown error'));
  await shutdown(true);
}
