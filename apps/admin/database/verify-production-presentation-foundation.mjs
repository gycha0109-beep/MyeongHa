import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read=name=>readFileSync(new URL(name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const production=read('production-presentation-foundation-manual-v1.sql');
const canonical=read('operator-presentation-offline-v1.sql');
function functions(sql){
 return [...sql.matchAll(/create function[\s\S]*?\$\$;/gu)].map(match=>match[0].replace(/\s+/gu,' ').trim());
}
test('managed installation preserves the five existing presentation domain functions',()=>{
 assert.equal(functions(production).length,5);
 assert.deepEqual(functions(production),functions(canonical));
});
test('production installs only private A7 authority and leaves customer principals and Reader grants unchanged',()=>{
 assert.doesNotMatch(production,/\b(?:password|myeongha_api_executor|anon|authenticated|service_role|myeongha_admin_reader)\b/iu);
 assert.doesNotMatch(production,/\b(?:update|delete from|alter table)\s+public\./iu);
 assert.match(production,/Existing presentation authority requires reconciliation/u);
 assert.match(production,/Installed forced-RLS audit foundation required/u);
});
test('ownership and ACL changes run atomically with an explicit NOINHERIT owner switch',()=>{
 assert.equal((production.match(/^BEGIN;$/gmu)??[]).length,1);
 assert.equal((production.match(/^COMMIT;$/gmu)??[]).length,1);
 const transfer=production.indexOf('alter function');
 const switchOwner=production.indexOf('set local role myeongha_admin_presentation_owner;');
 const acl=production.indexOf('revoke all on function');
 const reset=production.indexOf('reset role;');
 assert.ok(transfer<switchOwner&&switchOwner<acl&&acl<reset);
 assert.match(production,/revoke myeongha_admin_presentation_owner from postgres granted by postgres;/u);
 assert.match(production,/Public presentation function access forbidden/u);
 assert.match(production,/m\.inherit_option OR m\.set_option/u);
});
