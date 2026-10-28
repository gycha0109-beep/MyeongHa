// Watchtower-Track: commerce-payment
import {readFileSync} from 'node:fs';
import {describe,it,expect,beforeEach,vi} from 'vitest';

const state=vi.hoisted(()=>({
  execute:vi.fn(),
  query:vi.fn(),
  owner:vi.fn(),
}));
vi.mock('./postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:state.execute,
}));
vi.mock('./myeongha-owner-admin-access-v1.js',()=>({
  readOwnerAdminAccessV1:state.owner,
}));
import {
  CLOUDFLARE_PORTONE_OWNER_SANDBOX_HANDOFF_V1,
  loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1,
} from './cloudflare-portone-owner-sandbox-checkout-handoff-v1.js';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const ATTEMPT='22222222-2222-4222-8222-222222222222';
const INTENT='33333333-3333-4333-8333-333333333333';
const OFFER='44444444-4444-4444-8444-444444444444';
const PAYMENT_ID='mha_pa_'+'b'.repeat(32);
const env={
  Store_ID:'store-d9211773-4c6a-4736-9be7-c828405238bc',
  Channel_Key:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
  V2_API_Secret:'unit-test-only-never-real-secret',
};
const pool={} as PostgresSubjectPoolV1;
const identity:VerifiedSubjectIdentityEvidenceV1={
  kind:'member',verifiedAuthUserId:'55555555-5555-4555-8555-555555555555',
};
const input={env,pool,verifiedEvidence:identity,paymentAttemptId:ATTEMPT};
const GOOD={
  purchaseIntentId:INTENT,
  productOfferId:OFFER,
  paymentId:PAYMENT_ID,
  expectedAmountMinor:'1900',
  expectedCurrency:'KRW',
};

beforeEach(()=>{
  vi.resetAllMocks();
  state.query.mockResolvedValue({rows:[GOOD]});
  state.owner.mockResolvedValue({
    verifiedSubjectId:SUBJECT,
    isOwnerAdmin:true,chatCreditExempt:true,sandboxCheckoutAllowed:true,
  });
  state.execute.mockImplementation(async({execute}:{
    execute:(scope:{resolvedSubject:{subjectId:string;subjectKind:'member'};client:{query:typeof state.query}})=>Promise<unknown>;
  })=>execute({resolvedSubject:{subjectId:SUBJECT,subjectKind:'member'},client:{query:state.query}}));
});

describe('Cloudflare PortOne KCP V2 server-owned checkout handoff',()=>{
  it('is only a private candidate, never a public sale, mint or route',()=>{
    expect(CLOUDFLARE_PORTONE_OWNER_SANDBOX_HANDOFF_V1).toMatchObject({
      databaseFunction:'public.qry_commerce_owner_sandbox_credit_checkout_v2',
      publicRouteMounted:false,productionCheckoutEnabled:false,sandboxCreditMintEnabled:false,
      environment:'sandbox',
    });
  });
  it('returns exactly a browser-safe test SDK request from one canonical owned DB Attempt',async()=>{
    const result=await loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1(input);
    expect(result).toEqual({
      storeId:env.Store_ID,
      channelKey:env.Channel_Key,
      paymentId:PAYMENT_ID,
      orderName:'명하 채팅 크레딧 300개',
      totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
    });
    expect(JSON.stringify(result)).not.toContain(env.V2_API_Secret);
    expect(state.query).toHaveBeenCalledTimes(1);
    expect(state.query.mock.calls[0]?.[0]).toContain(
      'public.qry_commerce_owner_sandbox_credit_checkout_v2($1::uuid,$2::uuid)',
    );
    expect(state.query.mock.calls[0]?.[1]).toEqual([SUBJECT,ATTEMPT]);
    expect(state.owner).toHaveBeenCalledTimes(1);
  });
  it('rejects unverified and guest actors before any DB or PortOne operation',async()=>{
    await expect(loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1({
      ...input,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'unit-only'},
    })).rejects.toThrow('Owner PortOne sandbox checkout handoff unavailable.');
    await expect(loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1({
      ...input,paymentAttemptId:'not-a-uuid',
    })).rejects.toThrow();
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.owner).not.toHaveBeenCalled();
  });
  it('rejects mismatched, unsafe or absent DB evidence before Owner ACL and SDK',async()=>{
    for(const bad of [
      [],[{...GOOD,productOfferId:'malformed'}],
      [{...GOOD,expectedAmountMinor:'1901'}],
      [{...GOOD,expectedAmountMinor:1900}],
      [{...GOOD,expectedCurrency:'USD'}],
      [{...GOOD,paymentId:'invalid with spaces'}],
      [{...GOOD,purchaseIntentId:'not-canonical'}],
      [GOOD,GOOD],
    ]){
      state.query.mockResolvedValueOnce({rows:bad});
      await expect(loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1(input))
        .rejects.toThrow('Owner PortOne sandbox checkout handoff unavailable.');
    }
    expect(state.owner).not.toHaveBeenCalled();
  });
  it('does not open checkout after canonical DB Owner authority fails',async()=>{
    state.owner.mockResolvedValueOnce({
      verifiedSubjectId:SUBJECT,isOwnerAdmin:false,
      chatCreditExempt:false,sandboxCheckoutAllowed:false,
    });
    await expect(loadCloudflarePortOneOwnerSandboxCheckoutHandoffV1(input))
      .rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
  });
  it('base checkout SQL requires canonical Member, exact offer/capability provenance, sandbox and enabled SKU',()=>{
    const sql=readFileSync(new URL('../../../supabase/migrations/20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql',import.meta.url),'utf8');
    for(const exact of [
      'public.assert_myeongha_subject_context_v1(p_subject_id)',
      'public.qry_myeongha_owner_admin_access_v1(p_subject_id)',
      'owner_acl.sandbox_checkout_allowed',
      'public.qry_commerce_payment_attempt_handoff_context_v1(',
      "cpa.status='created'",
      "cpa.environment='sandbox'",
      "cpa.provider='portone_v2'",
      "p.product_key='chat_credits_300_v1'",
      'po.enabled=true','p.enabled=true',
      "h.expected_amount_minor=1900",
      'pi.offer_snapshot_jsonb=pg_catalog.jsonb_build_object(',
      'pi.capability_snapshot_jsonb=pg_catalog.jsonb_build_object(',
      'grant execute on function public.qry_commerce_owner_sandbox_credit_checkout_v1(uuid,uuid)',
      'to myeongha_api_executor;',
      'from public, anon, authenticated, service_role;',
    ])expect(sql).toContain(exact);
    expect(sql).not.toContain('update public.products');
    expect(sql).not.toContain('insert into public.chat_credit');
  });
});
