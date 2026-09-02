import { readFile } from 'node:fs/promises';

const workflowPath = '.github/workflows/production-user-data-bindings.yml';
const workflow = await readFile(workflowPath, 'utf8');

const requiredFragments = [
  'workflow_dispatch:',
  "description: 'Type BIND to provision production user-data credentials without deploying routes.'",
  'environment: production',
  'cancel-in-progress: false',
  'DISPATCH_CONFIRM: ${{ inputs.confirm }}',
  'SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc',
  'SUPABASE_ORIGIN: https://cnsfpcdiyofqvhpcegfc.supabase.co',
  'RUNTIME_DB_PRINCIPAL: myeongha_runtime',
  'API_EXECUTION_ROLE: myeongha_api_executor',
  'RUNTIME_ROLE_MARKER: myeongha:production-api-login-principal:v1',
  'VERCEL_PROJECT_ID: prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP',
  'VERCEL_TEAM_ID: team_xuYA9OhCWlJETaYFOmeVodgS',
  'SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}',
  'SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}',
  'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}',
  '[[ "$DISPATCH_CONFIRM" == \'BIND\' ]]',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/database/pooler',
  'select((.database_type // "") == "PRIMARY")',
  '(.connection_string // .connectionString // "")',
  'test("\\\\.pooler\\\\.supabase\\\\.com:(5432|6543)/postgres(?:\\\\?|$)")',
  '[[ "$pool_port" == \'5432\' || "$pool_port" == \'6543\' ]]',
  'https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/api-keys?reveal=true',
  '[[ "$admin_pool_user" == "postgres.$SUPABASE_PROJECT_ID" ]]',
  'runtime_pool_user="$RUNTIME_DB_PRINCIPAL.$SUPABASE_PROJECT_ID"',
  '.type == "publishable" and (.disabled != true)',
  '[[ "$supabase_publishable_key" == sb_publishable_* ]]',
  '::add-mask::$supabase_publishable_key',
  'authid.rolpassword is null',
  'and not runtime.rolbypassrls',
  'and not executor.rolbypassrls',
  'openssl rand -hex 32',
  '"MYEONGHA_DATABASE_URL"',
  '"MYEONGHA_DATABASE_PRINCIPAL"',
  '"MYEONGHA_SUPABASE_URL"',
  '"MYEONGHA_SUPABASE_API_KEY"',
  '"MYEONGHA_GUEST_FINGERPRINT_SECRET"',
  'type: "sensitive"',
  'target: ["production"]',
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true&teamId=$VERCEL_TEAM_ID',
  'alter role $RUNTIME_DB_PRINCIPAL password null;',
  'alter role $RUNTIME_DB_PRINCIPAL password',
  'current_user = \'$RUNTIME_DB_PRINCIPAL\'',
  'set local role $API_EXECUTION_ROLE;',
  'binding_verified=1',
  'No deployment or route activation was performed.',
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    throw new Error(`Missing production user-data binding contract fragment: ${fragment}`);
  }
}

const forbiddenFragments = [
  '\npush:',
  '\npull_request:',
  '\nschedule:',
  'vercel deploy',
  'vercel --prod',
  '/api/me.ts',
  'service_role',
  'supabase_admin',
  'MYEONGHA_DATABASE_PRINCIPAL: postgres',
  'sslmode=disable',
  'map(select(((.db_port // 0) | tonumber) == 5432))',
  'echo "publishable_key=',
  'echo "database_url=',
  'echo "runtime_password=',
  'echo "guest_fingerprint_secret=',
];

for (const fragment of forbiddenFragments) {
  if (workflow.includes(fragment)) {
    throw new Error(`Forbidden production user-data binding workflow fragment: ${fragment}`);
  }
}

const sensitiveBindingKeys = [
  'MYEONGHA_DATABASE_URL',
  'MYEONGHA_SUPABASE_API_KEY',
  'MYEONGHA_GUEST_FINGERPRINT_SECRET',
];

for (const key of sensitiveBindingKeys) {
  const keyIndex = workflow.indexOf(`key: "${key}"`);
  if (keyIndex < 0) {
    throw new Error(`Missing Vercel production binding for ${key}.`);
  }
  const bindingWindow = workflow.slice(keyIndex, keyIndex + 420);
  if (!bindingWindow.includes('type: "sensitive"')) {
    throw new Error(`${key} must be stored as a Vercel sensitive environment variable.`);
  }
  if (!bindingWindow.includes('target: ["production"]')) {
    throw new Error(`${key} must target Vercel production only.`);
  }
}

const vercelWriteIndex = workflow.indexOf(
  'https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?upsert=true&teamId=$VERCEL_TEAM_ID',
);
const passwordWriteIndex = workflow.indexOf(
  '-c "alter role $RUNTIME_DB_PRINCIPAL password \'$runtime_password\';"',
);

if (vercelWriteIndex < 0 || passwordWriteIndex < 0 || vercelWriteIndex >= passwordWriteIndex) {
  throw new Error(
    'Vercel production bindings must be persisted before the database runtime password is assigned.',
  );
}

const rollbackIndex = workflow.indexOf(
  '-c "alter role $RUNTIME_DB_PRINCIPAL password null;"',
);
if (rollbackIndex < 0 || rollbackIndex >= passwordWriteIndex) {
  throw new Error(
    'The fail-closed password rollback must be installed before the runtime password mutation.',
  );
}

if (!workflow.includes('trap cleanup EXIT')) {
  throw new Error('Production binding workflow must install the EXIT cleanup/rollback trap.');
}

console.log('MyeongHa production user-data binding workflow contract verification passed.');
