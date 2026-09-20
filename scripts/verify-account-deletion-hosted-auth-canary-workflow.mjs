import { readFile } from 'node:fs/promises';

const workflowPath =
  '.github/workflows/account-deletion-hosted-auth-canary.yml';
const canaryPath = 'scripts/run-account-deletion-hosted-auth-canary.mjs';
const keySelectionPath =
  'scripts/account-deletion-hosted-auth-canary-key-selection.mjs';
const deletionAdapterPath =
  'apps/api/src/supabase-auth-admin-user-deletion.ts';

const [workflow, canary, keySelection, deletionAdapter] = await Promise.all([
  readFile(workflowPath, 'utf8'),
  readFile(canaryPath, 'utf8'),
  readFile(keySelectionPath, 'utf8'),
  readFile(deletionAdapterPath, 'utf8'),
]);

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function rejectMatch(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

requireMatch(
  workflow,
  /^on:\s*\n\s{2}workflow_dispatch:/mu,
  'Hosted Auth canary must be workflow_dispatch-only.',
);
rejectMatch(
  workflow,
  /^\s{2}(push|pull_request|schedule|workflow_call):/mu,
  'Hosted Auth canary must not gain an automatic or reusable trigger.',
);
requireMatch(
  workflow,
  /environment:\s*production/u,
  'Hosted Auth canary must remain behind the production environment boundary.',
);
requireMatch(
  workflow,
  /DELETE_SYNTHETIC_AUTH_USER_ONLY/u,
  'Hosted Auth canary must require the exact destructive-canary confirmation token.',
);
requireMatch(
  workflow,
  /MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET:\s*\$\{\{\s*secrets\.MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET\s*\}\}/u,
  'Hosted Auth canary explicit Auth secret must come only from GitHub secrets.',
);
requireMatch(
  workflow,
  /SUPABASE_ACCESS_TOKEN:\s*\$\{\{\s*secrets\.SUPABASE_ACCESS_TOKEN\s*\}\}/u,
  'Hosted Auth canary Management fallback must use the governed GitHub production Supabase access token.',
);
requireMatch(
  workflow,
  /node scripts\/run-account-deletion-hosted-auth-canary\.mjs/u,
  'Hosted Auth canary workflow must invoke the governed canary runner.',
);
rejectMatch(
  workflow,
  /(SUPABASE_DB_PASSWORD|DATABASE_URL|PGHOST|PGPASSWORD|MYEONGHA_ACCOUNT_DELETION_WORKER_DATABASE_URL)/u,
  'Hosted Auth canary must not receive application or worker database credentials.',
);

requireMatch(
  canary,
  /production-account-deletion-auth-admin-config\.js/u,
  'Canary must consume the production Auth Admin config authority.',
);
requireMatch(
  canary,
  /supabase-auth-admin-user-deletion\.js/u,
  'Canary must execute the existing Supabase Auth Admin deletion adapter.',
);
requireMatch(
  canary,
  /account-deletion-hosted-auth-canary-key-selection\.mjs/u,
  'Canary must use the fail-closed Management API key selector.',
);
requireMatch(
  canary,
  /createSupabaseAuthAdminCredentialHeadersV1/u,
  'Canary creation and deletion must share the governed provider credential-header policy.',
);
requireMatch(
  canary,
  /https:\/\/api\.supabase\.com/u,
  'Canary Management fallback must pin the official Supabase Management API origin.',
);
requireMatch(
  canary,
  /\/v1\/projects\/\$\{PROJECT_REF\}\/api-keys\?reveal=true/u,
  'Canary may reveal API keys only for the exact governed project ref.',
);
requireMatch(
  canary,
  /method:\s*'GET'/u,
  'Canary Management API fallback must be read-only.',
);
rejectMatch(
  canary,
  /MANAGEMENT_API_ORIGIN}[\s\S]{0,250}method:\s*'(POST|PUT|PATCH|DELETE)'/u,
  'Canary must not create, rotate, update, or delete Supabase project API keys.',
);
requireMatch(
  canary,
  /MANAGEMENT_ACCESS_TOKEN_MISSING_OR_INVALID/u,
  'Canary must fail closed when the governed Management token is unavailable.',
);
requireMatch(
  canary,
  /\/auth\/v1\/admin\/users/u,
  'Canary must create its disposable user through the hosted Auth Admin endpoint.',
);
requireMatch(
  canary,
  /email_confirm:\s*true/u,
  'Canary user creation must avoid an email confirmation flow.',
);
requireMatch(
  canary,
  /@example\.com/u,
  'Canary must use the reserved example.com namespace instead of a real recipient.',
);
requireMatch(
  canary,
  /myeongha_canary:\s*'account-deletion-hosted-auth-v1'/u,
  'Canary user must be tagged for bounded operator cleanup.',
);
requireMatch(
  canary,
  /first\.outcome !== 'deleted'/u,
  'Canary must require a successful first hard delete.',
);
requireMatch(
  canary,
  /replay\.outcome !== 'already_absent'/u,
  'Canary must require idempotent already-absent replay.',
);
rejectMatch(
  canary,
  /(postgres-account-deletion-worker|production-account-deletion-worker-runtime|node-postgres-account-deletion-worker-pool)/u,
  'Hosted provider canary must not invoke the application deletion worker or database runtime.',
);
rejectMatch(
  canary,
  /console\.(log|error)\([^\n]*(syntheticEmail|createdUserId|authUserId|adminSecret|managementAccessToken|SUPABASE_ACCESS_TOKEN)/u,
  'Canary must not log identifiers or privileged credentials.',
);

requireMatch(
  keySelection,
  /entry\.type === 'secret'/u,
  'Hosted Auth canary must prefer current Supabase secret keys.',
);
requireMatch(
  keySelection,
  /entry\.name === 'service_role'/u,
  'Hosted Auth canary may fall back only to the legacy service_role key.',
);
requireMatch(
  keySelection,
  /MANAGEMENT_API_SECRET_KEY_AMBIGUOUS/u,
  'Multiple unnamed current secret keys must fail closed.',
);

requireMatch(
  deletionAdapter,
  /adminSecret\.startsWith\('sb_secret_'\)/u,
  'Auth Admin adapter must distinguish current Supabase secret keys from legacy service_role credentials.',
);
requireMatch(
  deletionAdapter,
  /return Object\.freeze\(\{\s*apikey:\s*adminSecret,\s*\}\);/u,
  'Current Supabase secret keys must use apikey-only provider authentication.',
);
requireMatch(
  deletionAdapter,
  /authorization:[^\n]*Bearer/u,
  'Legacy service_role credentials must preserve the Bearer provider contract.',
);

console.log(
  'MYEONGHA_HOSTED_AUTH_DELETE_CANARY_WORKFLOW_GOVERNANCE_PASS manual_only=true provider_only=true no_db_credentials=true credential_modes_pinned=true management_fallback_read_only=true',
);
