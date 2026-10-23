// Secret-free Stage 5 admission inventory and Wrangler leak/activation guard.
// Does not read process.env, a Cloudflare account, provider APIs, or any secrets.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = (name, kind, reviewer, source) =>
  Object.freeze({ name, kind, reviewer, source });

// Reviewer labels designate REQUIRED technical signoff, not signoff received.
// A name here is never permission to set it in an actual Cloudflare Preview.
export const CLOUDFLARE_STAGE5_BINDING_CATALOG_V1 = Object.freeze([
  entry('MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD','control','Security/API','workers/cloudflare-static-preview.mjs'),
  entry('MYEONGHA_CLOUDFLARE_AUTH_DB_MODE','approval','Security/API/DB','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE','approval','Security/API/Saju','workers/cloudflare-saju-preview-reading.mjs'),
  entry('MYEONGHA_CLOUDFLARE_AUTH_ORIGIN','approval','Security/API','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL','approval','Security/API/DB','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST','approval','Security/DB','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT','approval','Security/DB','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN','approval','Security/API','workers/cloudflare-auth-db-api.mjs'),
  entry('MYEONGHA_DATABASE_URL','secret','Security/DB','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_DATABASE_PRINCIPAL','configuration','Security/DB','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_DATABASE_TLS_PEER_MODE','configuration','Security/DB','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM','secret','Security/DB','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_SUPABASE_URL','configuration','Security/API','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_SUPABASE_API_KEY','secret','Security/API','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_GUEST_FINGERPRINT_SECRET','secret','Security/API/DB','apps/api/src/production-user-data-runtime-config.ts'),
  entry('MYEONGHA_AUTH_RATE_LIMIT_SECRET','secret','Security/API/DB','apps/api/src/production-member-auth-rate-limit-config.ts'),
  entry('MYEONGHA_GUEST_SESSION_TTL_SECONDS','configuration','Security/API/DB','apps/api/src/production-guest-bootstrap-credential-issuer.ts'),
  entry('MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET','secret','Security/API/DB','apps/api/src/production-birth-input-fingerprint.ts'),
  entry('MYEONGHA_NAVER_OAUTH_BRIDGE_ENABLED','control','Security/API','apps/api/src/naver-oauth-bridge-http.ts'),
  entry('MYEONGHA_NAVER_CLIENT_ID','configuration','Security/API','apps/api/src/naver-oauth-bridge-http.ts'),
  entry('MYEONGHA_NAVER_OAUTH_BRIDGE_KEY','secret','Security/API','apps/api/src/naver-oauth-bridge-http.ts'),
  entry('MYEONGHA_SOCIAL_AUTH_GOOGLE_ENABLED','control','Security/API','apps/api/src/social-auth-start-http.ts'),
  entry('MYEONGHA_SOCIAL_AUTH_KAKAO_ENABLED','control','Security/API','apps/api/src/social-auth-start-http.ts'),
  entry('MYEONGHA_SOCIAL_AUTH_NAVER_ENABLED','control','Security/API','apps/api/src/social-auth-start-http.ts'),
]);

const SENSITIVE_CONFIG_SECTIONS = Object.freeze([
  'vars', 'secrets', 'unsafe', 'route', 'routes', 'triggers',
  'hyperdrive', 'd1_databases', 'kv_namespaces', 'r2_buckets',
  'services', 'queues', 'durable_objects', 'send_email', 'ai',
]);

export function inspectCloudflareStage5BindingInventoryV1(
  config, catalog = CLOUDFLARE_STAGE5_BINDING_CATALOG_V1,
) {
  const reasons = [];
  if (config?.name !== 'myeongha' ||
      config?.main !== './workers/cloudflare-static-preview.mjs' ||
      config?.workers_dev !== true || config?.preview_urls !== true) {
    reasons.push('Worker deployment identity or approved workers.dev routing drift');
  }
  for (const name of SENSITIVE_CONFIG_SECTIONS) {
    if (Object.hasOwn(config ?? {}, name)) {
      reasons.push('Unapproved Cloudflare config section: ' + name);
    }
  }
  const names = new Set();
  const kinds = new Set(['secret', 'configuration', 'approval', 'control']);
  for (const row of catalog) {
    if (typeof row?.name !== 'string' ||
        !/^MYEONGHA_[A-Z0-9_]+$/.test(row.name) ||
        names.has(row.name) || !kinds.has(row.kind) ||
        typeof row.reviewer !== 'string' || !row.reviewer ||
        typeof row.source !== 'string' || !row.source.startsWith('apps/api/src/') &&
         !row.source.startsWith('workers/')) {
      reasons.push('Invalid Stage 5 catalog entry (no credential values logged)');
      continue;
    }
    names.add(row.name);
  }
  return Object.freeze({
    status: reasons.length === 0 ? 'PASS' : 'FAIL',
    bindingNames: names.size,
    sensitiveNames: catalog.filter(row => row.kind === 'secret').length,
    stage5ActivationEnabledByWrangler: false,
    reasons,
  });
}

export function inspectCloudflareStage5SourceReferencesV1(catalog, sourceContents) {
  const reasons = [];
  for (const row of catalog) {
    const contents = sourceContents.get(row.source);
    if (typeof contents !== 'string' || !contents.includes(row.name)) {
      reasons.push('Stage 5 catalog source missing binding name: ' + row.name);
    }
  }
  return Object.freeze({ status: reasons.length ? 'FAIL' : 'PASS', reasons });
}

async function main() {
  const config = JSON.parse(await readFile(resolve('wrangler.jsonc'), 'utf8'));
  const sources = new Map();
  for (const row of CLOUDFLARE_STAGE5_BINDING_CATALOG_V1) {
    if (!sources.has(row.source)) {
      sources.set(row.source, await readFile(resolve(row.source), 'utf8'));
    }
  }
  const policy = inspectCloudflareStage5BindingInventoryV1(config);
  const references = inspectCloudflareStage5SourceReferencesV1(
    CLOUDFLARE_STAGE5_BINDING_CATALOG_V1, sources,
  );
  const status = policy.status === 'PASS' && references.status === 'PASS'
    ? 'PASS' : 'FAIL';
  const result = {
    status,
    bindingNames: policy.bindingNames,
    secretBindingNames: policy.sensitiveNames,
    previewActivation: 'HOLD',
    reasons: [...policy.reasons, ...references.reasons],
  };
  console.log('Cloudflare Stage 5 binding inventory (names only):', JSON.stringify(result));
  if (status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
