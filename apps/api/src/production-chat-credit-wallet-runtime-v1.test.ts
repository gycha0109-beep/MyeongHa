import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PRODUCTION_CHAT_CREDIT_WALLET_V1} from './production-chat-credit-wallet-runtime-v1.js';

describe('governed production signup wallet',()=>{
  it('routes only authenticated Member wallet reads; paid operations stay disabled',()=>{
    expect(PRODUCTION_CHAT_CREDIT_WALLET_V1).toMatchObject({
      route:'/api/me/credits',method:'GET',signupGrantCredits:50,
      signupValidDays:30,paidTopUpEnabled:false,
      paidReadingRewardEnabled:false,chatDebitEnabled:false,
    });
  });
  it('pins actual source migration to signup only and account-deletion erasure',()=>{
    const sql=readFileSync(new URL('../../../supabase/migrations/1725_chat_credit_signup_wallet_runtime_v1.sql',import.meta.url),'utf8');
    expect(sql).toContain("source_kind = 'signup'");
    expect(sql).toContain("v_now+interval '30 days'");
    expect(sql).toContain('internal_tr_chat_credit_subject_erasure_v1');
    expect(sql).toContain('assert_myeongha_subject_context_v1');
    expect(sql).toContain('grant execute on function public.internal_qry_chat_credit_balance_v1(uuid)');
    expect(sql).not.toContain('create function public.internal_cmd_chat_credit_verified_topup_v1');
    expect(sql).not.toContain("product_type in ('reading','episode','subscription','bundle','credit')");
  });
});
