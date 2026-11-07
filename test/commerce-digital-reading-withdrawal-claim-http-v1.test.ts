import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  handleDigitalReadingWithdrawalClaimHttpV1 as handle,
  COMMERCE_READING_WITHDRAWAL_CLAIM_HTTP_V1 as policy,
} from '../apps/api/src/commerce-digital-reading-withdrawal-claim-http-v1.js';
import type {PostgresSubjectPoolV1} from '../apps/api/src/postgres-subject-execution.js';
import type {IdentityEvidenceVerificationPortV1} from '../apps/api/src/current-subject-profile-http.js';

const subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reading='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const purchase='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const claim='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const nonce='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const secret='a-private-hmac-secret-with-40-characters-and-more';
const endpoint='https://example.com/api/me?__myeongha_withdrawal_claim=1';
const body={purchaseIntentId:purchase,unitId:reading,
  idempotencyKey:nonce,reason:'change_of_mind'};
type FixtureOptions={subject?:string; deny?:boolean; replayed?:boolean; missing?:boolean; conflict?:boolean;
  status?:'received'|'refund_decision_recorded'|'refund_processing'|'refund_confirmed';};
function fixture(options:FixtureOptions={}){
  const queries:{sql:string;values:readonly unknown[]|undefined}[]=[];
  // Vitest generic SQL mock is runtime-valid; its generic return cannot be inferred by TS.
  const pool={connect:vi.fn(async()=>({
    query:vi.fn(async<Row=Record<string,unknown>>(sql:string,values?:readonly unknown[])=>{
      queries.push({sql,values});
      if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'
        ||sql==='SET LOCAL ROLE myeongha_api_executor')return {rows:[] as Row[]};
      if(sql.includes('begin_member_subject_context_v1'))
        return {rows:[{subjectId:options.subject??subject,subjectKind:'member'} as Row]};
      if(sql.includes('assert_myeongha_subject_context_v1'))return {rows:[{} as Row]};
      if(sql.includes('cmd_receive_digital_reading_withdrawal_claim_v1')){
        if(options.deny||options.conflict)throw Error('claim denied by DB');
        return {rows:[{
          claimId:claim,receivedAt:'2026-11-01T13:00:00.000Z',
          replayed:options.replayed===true,
        } as Row]};
      }
      if(sql.includes('qry_received_digital_reading_withdrawal_claim_v1'))
        return {rows:options.missing?[] as Row[]:[{
          claimId:claim,receivedAt:'2026-11-01T13:00:00.000Z',
          state:options.status??'received',
        } as Row]};
      throw Error('UNEXPECTED_SQL');
    }),
    release:vi.fn(),
  }))};
  const verifier:IdentityEvidenceVerificationPortV1={
    verifyRequestIdentity:vi.fn(async()=>({
      kind:'member' as const,verifiedAuthUserId:subject,
    })),
  };
  function request(overrides:{url?:string;method?:string;body?:unknown;origin?:string}={}){
    return new Request(overrides.url??endpoint,{
      method:overrides.method??'POST',
      headers:{
        authorization:'Bearer test.member.jwt',
        origin:overrides.origin??'https://example.com',
        'content-type':'application/json',
      },
      ...(overrides.method==='GET'?{}:{body:JSON.stringify(overrides.body??body)}),
    });
  }
  const run=(req=request(),enabled=true,signingKey:string|undefined=secret)=>handle({request:req,
    identityEvidenceVerifier:verifier,pool:pool as unknown as PostgresSubjectPoolV1,
    enabled,idempotencySecret:signingKey});
  return {pool:pool as unknown as PostgresSubjectPoolV1,verifier,queries,request,run};
}
describe('buyer exact paid Reader withdrawal intake',()=>{
  it('never auto-enables an intake, refund, payment or legal approval',()=>{
    expect(policy).toMatchObject({
      customerSelfServiceEnabledByDefault:false,
      decisionAutomatic:false,providerRefundAutomatic:false,
      maxBodyBytes:2048,
    });
  });
  it('refuses unactivated request before identity or DB',async()=>{
    const f=fixture();const response=await f.run(f.request(),false);
    expect(response.status).toBe(503);
    expect(f.queries).toHaveLength(0);
    expect(f.verifier.verifyRequestIdentity).not.toHaveBeenCalled();
  });
  it('accepts one exact owned unit and returns real DB claim acknowledgment only after COMMIT',async()=>{
    const f=fixture();
    const response=await f.run();
    expect(response.status).toBe(201);
    const json=await response.json();
    expect(json.data).toEqual({
      claimId:claim,receivedAt:'2026-11-01T13:00:00.000Z',
      status:'received',replayed:false,
      refundApproved:false,providerRefundCompleted:false,
    });
    expect(f.queries.some(q=>q.sql==='COMMIT')).toBe(true);
    const insert=f.queries.find(q=>q.sql.includes('cmd_receive_digital_reading_withdrawal_claim_v1'))!;
    expect(insert.values?.slice(0,4)).toEqual([
      subject,purchase,reading,'change_of_mind',
    ]);
    expect(String(insert.values?.[4])).toMatch(/^hmac-sha256:k1:[a-f0-9]{64}$/u);
    expect(String(insert.values?.[5])).toMatch(/^sha256:v1:[a-f0-9]{64}$/u);
    expect(JSON.stringify(json)).not.toContain(subject);
    expect(JSON.stringify(json)).not.toContain(purchase);
  });
  it('accepts an authenticated buyer complaint when order evidence is unavailable',async()=>{
    const f=fixture();
    const response=await f.run(f.request({body:{
      idempotencyKey:nonce,reason:'not_provided',
    }}));
    expect(response.status).toBe(201);
    const insert=f.queries.find(q=>q.sql.includes('cmd_receive_digital_reading_withdrawal_claim_v1'))!;
    expect(insert.values?.slice(0,4)).toEqual([subject,null,null,'not_provided']);
    const data=(await response.json()).data;
    expect(data).toMatchObject({status:'received',refundApproved:false});
  });
  it('rejects a one-sided purchase scope; buyer must supply both or neither',async()=>{
    const f=fixture();
    const response=await f.run(f.request({body:{
      purchaseIntentId:purchase,idempotencyKey:nonce,reason:'not_provided',
    }}));
    expect(response.status).toBe(400);
    expect(f.queries).toHaveLength(0);
  });
  it('same nonce replay explicitly marked without double-intake',async()=>{
    const f=fixture({replayed:true});
    const result=await f.run();expect(result.status).toBe(201);
    expect((await result.json()).data.replayed).toBe(true);
  });
  it('forbids request from another browser origin without verifying session',async()=>{
    const f=fixture();
    const r=await f.run(f.request({origin:'https://evil.example'}));
    expect(r.status).toBe(403);
    expect(f.queries).toHaveLength(0);
  });
  function nativePost(headers:Record<string,string>={}):Request{
    return new Request(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json',...headers},
      body:JSON.stringify(body),
    });
  }
  it('admits native JWT-only member claim without Origin or Cookie',async()=>{
    const f=fixture();
    const request=nativePost({authorization:'Bearer test.member.jwt'});
    expect(request.headers.has('origin')).toBe(false);
    const response=await f.run(request);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ok:true,data:{status:'received',refundApproved:false,providerRefundCompleted:false},
    });
    expect(f.verifier.verifyRequestIdentity).toHaveBeenCalledExactlyOnceWith(request);
    expect(f.queries.some(q=>q.sql.includes('cmd_receive_digital_reading_withdrawal_claim_v1')))
      .toBe(true);
  });
  it.each([
    {caseName:'no Authorization',headers:{}},
    {caseName:'non-JWT Bearer',headers:{authorization:'Bearer opaque'}},
    {caseName:'ambient Cookie without Origin',headers:{
      authorization:'Bearer test.member.jwt',cookie:'session=ambient',
    }},
    {caseName:'foreign Origin even with Bearer',headers:{
      authorization:'Bearer test.member.jwt',origin:'https://evil.example',
    }},
    {caseName:'literal null Origin even with Bearer',headers:{
      authorization:'Bearer test.member.jwt',origin:'null',
    }},
  ])('rejects native intake $caseName before identity and DB',async({headers})=>{
    const f=fixture();
    const response=await f.run(nativePost(headers));
    expect(response.status).toBe(403);
    expect(f.verifier.verifyRequestIdentity).not.toHaveBeenCalled();
    expect(f.queries).toHaveLength(0);
  });
  it('does not treat JWT shape as authentication for native intake',async()=>{
    const f=fixture();
    vi.mocked(f.verifier.verifyRequestIdentity).mockResolvedValue(null);
    const response=await f.run(nativePost({authorization:'Bearer test.member.jwt'}));
    expect(response.status).toBe(401);
    expect(f.queries).toHaveLength(0);
  });
  it('blocks unauthenticated and Guest access',async()=>{
    const f=fixture();
    vi.mocked(f.verifier.verifyRequestIdentity).mockResolvedValue(null);
    const a=await f.run();expect(a.status).toBe(401);
    expect(f.queries).toHaveLength(0);
  });
  it('returns no false acceptance on DB rejection or replay conflict',async()=>{
    const f=fixture({conflict:true});
    const r=await f.run();expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ok:false});
    expect(f.queries.at(-1)?.sql).toBe('ROLLBACK');
  });
  it('lets owner re-read only a known claim status after scoped DB read',async()=>{
    const f=fixture();
    const r=await f.run(f.request({
      method:'GET',url:endpoint+'&claimId='+claim,
    }));
    expect(r.status).toBe(200);
    expect((await r.json()).data).toEqual({
      claimId:claim,receivedAt:'2026-11-01T13:00:00.000Z',
      status:'received',
    });
  });
  it('allows scoped customer status GET without an unrelated POST signing secret',async()=>{
    const f=fixture({status:'refund_processing'});
    const r=await f.run(f.request({
      method:'GET',url:endpoint+'&claimId='+claim,
    }),true,undefined);
    expect(r.status).toBe(200);
    expect((await r.json()).data).toMatchObject({
      claimId:claim,status:'refund_processing',
    });
    expect(f.queries.some(q=>q.sql.includes(
      'qry_received_digital_reading_withdrawal_claim_v1'))).toBe(true);
    expect(f.queries.some(q=>q.sql.includes(
      'cmd_receive_digital_reading_withdrawal_claim_v1'))).toBe(false);
  });
  it('keeps customer intake POST disabled without its HMAC signing secret',async()=>{
    const f=fixture();
    const r=await f.run(f.request(),true,undefined);
    expect(r.status).toBe(503);
    expect(f.queries).toHaveLength(0);
    expect(f.verifier.verifyRequestIdentity).not.toHaveBeenCalled();
  });
  it.each(['refund_decision_recorded','refund_processing','refund_confirmed'] as const)(
    'shows exact owned customer claim lifecycle state %s without exposing raw refund evidence',async status=>{
      const f=fixture({status});
      const r=await f.run(f.request({method:'GET',url:endpoint+'&claimId='+claim}));
      expect(r.status).toBe(200);
      expect((await r.json()).data.status).toBe(status);
    });
  it('does not disclose existence of another Subject claim',async()=>{
    const f=fixture({missing:true});
    const r=await f.run(f.request({
      method:'GET',url:endpoint+'&claimId='+claim,
    }));
    expect(r.status).toBe(404);
  });
  it('rejects extraneous body fields and malformed IDs before DB',async()=>{
    const f=fixture();
    const r=await f.run(f.request({body:{...body,refundApproved:true}}));
    expect(r.status).toBe(400);
    expect(f.queries).toHaveLength(0);
  });
  it('latest S4 protected-content finalizer preserved in migrated DELETE graph',()=>{
    const sql=readFileSync(new URL(
      '../supabase/migrations/2320_commerce_digital_reading_claim_account_delete_v1.sql',
      import.meta.url),'utf8');
    expect(sql).toContain('create table public.digital_reading_withdrawal_claims_private_v1');
    expect(sql).toContain('delete from public.digital_reading_withdrawal_claims_private_v1');
    expect(sql).toContain('v_reader_protected_count');
    expect(sql).toContain('official_reader_paid_answer_bodies');
    expect(sql).toContain('official_reader_account_deletion_privacy_status_v1');
    expect(sql).toContain('create function public.cmd_receive_digital_reading_withdrawal_claim_v1');
    expect(sql).toContain('public.assert_myeongha_subject_context_v1(p_subject_id)');
    expect(sql).toContain('Serialize with the account finalizer');
    expect(sql).toContain('for share;');
    expect(sql).toContain('d.source_claim_fingerprint=');
    expect(sql).toContain('refund_decision_recorded');
    expect(sql).toContain('refund_processing');
    expect(sql).toContain('refund_confirmed');
    expect(sql).toContain('digital_reading_withdrawal_claim_scope_shape_check');
    expect(sql).toContain('to myeongha_api_executor;');
    expect(sql).not.toContain('grant all on table public.digital_reading_withdrawal_claims_private_v1');
  });
});
