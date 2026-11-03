import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const functions=sql=>[...sql.matchAll(/create function[\s\S]*?\$\$;/gu)].map(m=>m[0].replace(/\s+/gu,' ').trim());
for(const [production,candidates,count] of [
 ['production-audit-retention-foundation-manual-v1.sql',['operator-audit-retention-offline-v1.sql'],2],
 ['production-ai-finance-foundation-manual-v1.sql',['ai-finance-offline-v1.sql','ai-budget-offline-v1.sql'],4],
]){
 test(production+' preserves the existing functions and isolated installation boundary',()=>{
  const sql=read(production);
  assert.equal(functions(sql).length,count);
  assert.deepEqual(functions(sql),candidates.flatMap(name=>functions(read(name))));
  assert.equal((sql.match(/^BEGIN;$/gmu)??[]).length,1);
  assert.equal((sql.match(/^COMMIT;$/gmu)??[]).length,1);
  assert.match(sql,/set local role myeongha_admin_/u);
  assert.match(sql,/from postgres granted by postgres;/u);
  assert.doesNotMatch(sql,/\b(?:insert into|update|delete from|alter table)\s+public\./iu);
  assert.doesNotMatch(sql,/\bgrant\b[^;]*\bto\s+(?:public|anon|authenticated|service_role)\b/iu);
 });
}
