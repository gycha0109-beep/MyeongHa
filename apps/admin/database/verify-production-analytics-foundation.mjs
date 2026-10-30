import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8').replaceAll('\r\n','\n');
const production=read('production-analytics-foundation-manual-v1.sql');
const canonical=read('analytics-pipeline-offline-v1.sql');
const normalized=sql=>sql.replace(/\s+/gu,' ').trim();
test('Production storage remains the exact existing A5 schema, role and retention contract',()=>{
 const actual=production.slice(production.indexOf('create schema'),production.indexOf('DO $analytics_postflight$'));
 const expected=canonical.slice(canonical.indexOf('create schema'),canonical.lastIndexOf('commit;'));
 assert.equal(normalized(actual),normalized(expected));
});
test('storage installation is atomic, rejects existing authority and does not enable collection',()=>{
 assert.equal((production.match(/^BEGIN;$/gmu)??[]).length,1);
 assert.equal((production.match(/^COMMIT;$/gmu)??[]).length,1);
 assert.match(production,/Existing analytics authority requires reconciliation/u);
 assert.match(production,/Installed restricted Admin Reader required/u);
 assert.doesNotMatch(production,/\b(?:update|delete from|alter table)\s+public\./iu);
 assert.doesNotMatch(production,/\bgrant\b[^;]*\bto\s+(?:public|anon|authenticated|service_role)\b/iu);
 assert.doesNotMatch(production,/\b(?:cron\.schedule|alter role|password)\s*\(/iu);
});
