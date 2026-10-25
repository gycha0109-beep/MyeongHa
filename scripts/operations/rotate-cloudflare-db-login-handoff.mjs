// One-time owner-local, encrypted credential handoff for the production Cloudflare
// dedicated PostgreSQL LOGIN. No password, SQL containing a password, account
// token, provider response body, or decrypted secret is ever logged/artifacted.
// Watchtower-Track: ops
import { randomBytes, createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const PROJECT = 'cnsfpcdiyofqvhpcegfc';
const ROLE = 'myeongha_cf_api_login';
const PUB_DER_B64 = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAxjfAtf/z/OaD32OLoNfv23JsUDEHCtyXIXXyljXpT5gF2j0k0LuMamcs5y+rS03LFk+QDCvlIAAC+UQZOu5kMt0H36G+3Ok5vnKVC3F/RK5sqNTGnJObNQtxeS9OWq757CSQV9lUxXR5Cm6I0PXUq3w1LkHtf4xYhWKUOdaU1q9CJaym1AC32G53hfhIldkEvQI1BTPEmpdV38LZpMqLMzHHYoMASRVcYnvYlVNp4gBGimhB4Ub/oQvhWJgB9stdriJPOkt8SNCVdJBqv48W8wvNAaNT7s5OUGbpFCyV4/k5cFRlED9u2/85zoiSAoiX2gWI2bmes4KQeYEfIihreHsQGueCUEOyTtimylpYtImBsq6wpa218Yh0YKWdRMS0hTfjy1Mulp9QeyY2TEfu95Pin5dAu3tzsvxK7+tlKd6jMBBwT6IuLvrlabkrBioazcXYZrXP0ZBtFvpcab1j4IfGJFXmQ/FOR0E/vbND4XBdCkMaTGbtqrkiUm5Lxk1XAgMBAAE=';
const REQUIRED_CONFIRM = 'ROTATE_MYEONGHA_CF_DB_LOGIN_20261026';

function ensure(condition, reason) {
  if (!condition) throw new Error(reason);
}

async function runQuery(query) {
  const response = await fetch(
    'https://api.supabase.com/v1/projects/' + PROJECT + '/database/query',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, read_only: false }),
    },
  );
  ensure(response.status === 201,
    'Supabase management SQL operation rejected (HTTP ' + response.status + ')');
  const payload = await response.json();
  ensure(!payload?.error, 'Supabase management SQL returned an error');
  return Array.isArray(payload) ? payload : payload?.result;
}

async function main() {
  ensure(process.env.CONFIRM === REQUIRED_CONFIRM, 'Invalid operator confirmation');
  ensure(process.env.GITHUB_REF === 'refs/heads/main', 'Not a main-branch operation');
  ensure(process.env.GITHUB_RUN_ATTEMPT === '1', 'Do not retry an uncertain rotation');
  ensure(typeof process.env.SUPABASE_ACCESS_TOKEN === 'string' &&
    process.env.SUPABASE_ACCESS_TOKEN.length >= 20, 'Production management token missing');
  ensure(typeof process.env.HANDOFF_OUTPUT === 'string' &&
    process.env.HANDOFF_OUTPUT.endsWith('.bin'), 'Encrypted handoff path not configured');

  const recipient = createPublicKey({
    key: Buffer.from(PUB_DER_B64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  ensure(recipient.asymmetricKeyType === 'rsa' &&
    recipient.asymmetricKeyDetails?.modulusLength >= 3072, 'Recipient key rejected');

  const rows = await runQuery(`select
    exists(select 1 from pg_roles where rolname='myeongha_cf_api_login'
      and rolcanlogin and not rolbypassrls and not rolsuper
      and not rolcreaterole and not rolcreatedb) as safe_login,
    pg_has_role('myeongha_cf_api_login','myeongha_api_executor','MEMBER') as member_executor,
    exists(select 1 from pg_roles where rolname='myeongha_api_executor'
      and not rolcanlogin and not rolbypassrls) as safe_executor;`);
  ensure(Array.isArray(rows) && rows.length === 1 &&
    rows[0]?.safe_login === true && rows[0]?.member_executor === true &&
    rows[0]?.safe_executor === true, 'Dedicated DB role authority preflight failed');

  const password = randomBytes(48).toString('hex');
  ensure(/^[a-f0-9]{96}$/.test(password), 'Generated password format failure');
  const ciphertext = publicEncrypt({
    key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
  }, Buffer.from(password, 'utf8'));
  ensure(ciphertext.length >= 384, 'Ciphertext too short');

  // Role credentials are altered only after the RSA encrypted handoff
  // exists in memory and all independent role/RLS preconditions passed.
  await runQuery("ALTER ROLE " + ROLE + " WITH PASSWORD '" + password + "';");
  await writeFile(process.env.HANDOFF_OUTPUT, ciphertext, { flag: 'wx', mode: 0o600 });
  console.log('cloudflare_db_rotation=ROTATED_ENCRYPTED_HANDOFF_READY');
}

try {
  await main();
} catch (error) {
  // Print a short, fixed class only. Never print provider response text,
  // environment values, generated password, SQL, or the error object.
  const text = error instanceof Error ? error.message : '';
  const allowed = [
    'Invalid operator confirmation', 'Not a main-branch operation',
    'Do not retry an uncertain rotation', 'Production management token missing',
    'Encrypted handoff path not configured', 'Recipient key rejected',
    'Dedicated DB role authority preflight failed', 'Generated password format failure',
    'Ciphertext too short', 'Supabase management SQL returned an error',
  ];
  const category = allowed.includes(text) ? text
    : /^Supabase management SQL operation rejected \(HTTP [0-9]{3}\)$/.test(text)
      ? text : 'Encrypted rotation operation failed';
  console.error('cloudflare_db_rotation=FAILED: ' + category);
  process.exitCode = 1;
}
