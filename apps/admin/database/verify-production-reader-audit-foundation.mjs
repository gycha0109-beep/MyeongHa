import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const get=name=>readFileSync(new URL('./'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const production=get('production-reader-audit-foundation-manual-v1.sql');
const canonical=['operator-audit-local-v1.sql','operator-roles-offline-v1.sql']
  .map(name=>get(name).replace(/^--[^\n]*\n/gm,'')
    .replace(/^\s*begin;\s*$/gim,'')
    .replace(/^\s*commit;\s*$/gim,'').trim())
  .join('\n\n');
const normalized=value=>value.replace(/\s+/g,' ').trim();

test('Reader/Audit install is one atomic transaction including its preflight',()=>{
  assert.match(production,/\nBEGIN;\n\nDO \$admin_preflight\$/u);
  assert.ok(production.trimEnd().endsWith('COMMIT;'));
  assert.equal((production.match(/^BEGIN;$/gm)??[]).length,1);
  assert.equal((production.match(/^COMMIT;$/gm)??[]).length,1);
  assert.ok(production.indexOf('BEGIN;')<production.indexOf('create schema'));
  assert.ok(production.lastIndexOf('COMMIT;')>production.indexOf('create policy admin_append_audit_v1'));
});

test('installation remains the exact reviewed offline Audit and Reader/Writer contract',()=>{
  const start=production.indexOf('create schema if not exists myeongha_admin_ops;');
  const end=production.lastIndexOf('\nCOMMIT;');
  assert.ok(start>0 && end>start);
  assert.equal(normalized(production.slice(start,end)),normalized(canonical));
});

test('no ordinary app privileges, credentials, or activation are introduced',()=>{
  assert.match(production,/Existing Admin authority requires explicit reconciliation/u);
  assert.match(production,/nobypassrls/u);
  assert.match(production,/create policy admin_append_audit_v1/u);
  assert.doesNotMatch(production,/\b(password\s+\S+|alter\s+default\s+privileges|grant\s+.+\s+to\s+(?:public|anon|authenticated|service_role))\b/iu);
  assert.doesNotMatch(production,/MYEONGHA_ADMIN_PRIVATE_ENABLED\s*=\s*true/iu);
});
