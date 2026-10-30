import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const production=read('production-reading-ai-cost-foundation-manual-v1.sql');
const canonical=read('reading-ai-call-cost-offline-v1.sql');
const functions=sql=>[...sql.matchAll(/create function[\s\S]*?\$\$;/gu)].map(m=>m[0].replace(/\s+/gu,' ').trim());
test('Production uses the existing three Reading cost functions with the replay SQL fix',()=>{
 assert.equal(functions(production).length,3);
 assert.deepEqual(functions(production),functions(canonical));
 assert.match(production,/on conflict on constraint reading_ai_call_cost_events_v1_pkey do nothing/u);
});
test('managed ownership is bounded and no Reading execution or public principal can be changed',()=>{
 assert.match(production,/set local role myeongha_reading_ai_cost_source_v1;/u);
 assert.match(production,/revoke myeongha_reading_ai_cost_source_v1 from postgres granted by postgres;/u);
 assert.match(production,/Existing Reading cost authority requires reconciliation/u);
 assert.doesNotMatch(production,/\b(?:insert into|update|delete from|alter table)\s+public\./iu);
 assert.doesNotMatch(production,/\bgrant\b[^;]*\bto\s+(?:public|anon|authenticated|service_role)\b/iu);
 assert.equal((production.match(/^BEGIN;$/gmu)??[]).length,1);
 assert.equal((production.match(/^COMMIT;$/gmu)??[]).length,1);
});
