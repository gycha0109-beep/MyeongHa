import { readFile } from 'node:fs/promises';

const files = await Promise.all([
  readFile('.github/workflows/production-member-me-smoke.yml', 'utf8'),
  readFile('.github/workflows/production-saju-current-subject-smoke.yml', 'utf8'),
  readFile('scripts/production-member-smoke-session.mjs', 'utf8'),
  readFile('scripts/verify-production-member-me.mjs', 'utf8'),
  readFile('scripts/verify-production-saju-current-subject.mjs', 'utf8'),
]);

const joined = files.join('\n');
for (const forbidden of [
  'MYEONGHA_PRODUCTION_MEMBER_BEARER',
  'MYEONGHA_PRODUCTION_BIRTH_SMOKE_MEMBER_BEARER',
  'refreshToken',
  'localStorage',
]) {
  if (joined.includes(forbidden)) {
    throw new Error(`Fresh-session smoke authority contains forbidden fragment: ${forbidden}`);
  }
}

for (const required of [
  'MYEONGHA_PRODUCTION_MEMBER_EMAIL',
  'MYEONGHA_PRODUCTION_MEMBER_PASSWORD',
  'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
  '/api/auth/sign-in',
  'acquireProductionMemberSmokeSession',
]) {
  if (!joined.includes(required)) {
    throw new Error(`Fresh-session smoke authority is missing required fragment: ${required}`);
  }
}

console.log('MyeongHa production smoke fresh-session authority verification passed.');
