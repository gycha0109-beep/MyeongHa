// Watchtower-Track: commerce-payment
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CHAT_CREDIT_PORTONE_V2_OFFER_V1}
  from '../apps/api/src/portone-chat-credit-checkout-v1.js';

const migration=readFileSync(new URL('../supabase/migrations/20261026100200_portone_chat_credit_catalog_staged_v1.sql',import.meta.url),'utf8');
describe('PortOne chat credit product staged without sale privileges',()=>{
 it('keeps canonical Product and Offer disabled before verified settlement',()=>{
   expect(migration).toContain("'chat_credits_300_v1','credit',false");
   expect(migration).toContain("'web','portone_v2'");
   expect(migration).toContain("'KRW',1900,false");
   expect(migration).toContain("1900,'KRW'");
   expect(migration).toContain("'commerce.chat_credits_300_v1'");
 });
 it('pins browser checkout to the DB catalog and 10 credits per reply',()=>{
   expect(migration).toContain("'"+CHAT_CREDIT_PORTONE_V2_OFFER_V1.externalProductId+"'");
   expect(CHAT_CREDIT_PORTONE_V2_OFFER_V1.credits).toBe(300);
   expect(CHAT_CREDIT_PORTONE_V2_OFFER_V1.amountMinor).toBe(1900);
 });
});
