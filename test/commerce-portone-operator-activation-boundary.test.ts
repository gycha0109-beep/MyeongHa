import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const read=(name:string)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');

describe('PortOne credit catalog and verified owner authority',()=>{
 it('restricts the owner grant to exactly one confirmed active Member',()=>{
  const sql=read('20261026095000_commerce_operator_chat_testing_authority_v1.sql');
  expect(sql).toContain("lower(a.email)='gycha0109@gmail.com'");
  expect(sql).toContain('a.email_confirmed_at is not null');
  expect(sql).toContain("s.kind='member' and s.status='active'");
  expect(sql).toContain('if v_count<>1 then');
  expect(sql).toContain('assert_myeongha_subject_context_v1');
  expect(sql).toContain('from public,anon,authenticated,service_role');
  expect(sql).toContain('to myeongha_api_executor');
  expect(sql).not.toMatch(/alter\\s+role\\s+[^;]*bypassrls/i);
  expect(sql).not.toContain('alter role');
 });
 it('stages 300 credits at 1900 won without exposing a live product',()=>{
  const sql=read('20261026100200_portone_chat_credit_catalog_staged_v1.sql');
  expect(sql).toContain("'chat_credits_300_v1','credit',false");
  expect(sql).toContain("'web','portone_v2'");
  expect(sql).toContain("'KRW',1900,false");
  expect(sql).toContain("'krw-1900-v1',1900,'KRW'");
  expect(sql).not.toContain('payment succeeded');
 });
});
