// Watchtower-Track: commerce-payment
import {describe,it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({
  execute:vi.fn(),
  query:vi.fn(),
}));
vi.mock('./postgres-subject-execution.js',()=>({
  executePostgresSubjectTransactionV1:state.execute,
}));
import {
  commitCloudflareOwnerPortOneSandboxHandoffV1,
  CLOUDFLARE_OWNER_PORTONE_HANDOFF_COMMIT_V1,
} from './cloudflare-owner-portone-sandbox-handoff-commit-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const ATTEMPT='22222222-2222-4222-8222-222222222222';
const PAYMENT_ID='mha_pa_'+'c'.repeat(32);
const IDENTITY={kind:'member' as const,verifiedAuthUserId:'33333333-3333-4333-8333-333333333333'};
const INPUT={pool:{} as never,verifiedEvidence:IDENTITY,paymentAttemptId:ATTEMPT,providerRequestId:PAYMENT_ID};
beforeEach(()=>{
  vi.resetAllMocks();
  state.query.mockResolvedValue({rows:[{
    paymentAttemptId:ATTEMPT,provider:'portone_v2',
    environment:'sandbox',providerRequestId:PAYMENT_ID,status:'handed_off',
  }]});
  state.execute.mockImplementation(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
    execute({client:{query:state.query},resolvedSubject:{subjectId:SUBJECT,subjectKind:'member'}}));
});
describe('canonical Owner PortOne TEST checkout handoff commit',()=>{
 it('pins only sandbox handoff status and cannot mint credits',()=>{
  expect(CLOUDFLARE_OWNER_PORTONE_HANDOFF_COMMIT_V1).toMatchObject({
    databaseFunction:'public.cmd_transition_payment_attempt_v1',
    targetStatus:'handed_off',environment:'sandbox',
    publicRouteMounted:false,enablesPaymentSettlement:false,enablesCreditMint:false,
  });
 });
 it('transitions only canonical resolved Subject and unchanged Attempt identifier',async()=>{
  await expect(commitCloudflareOwnerPortOneSandboxHandoffV1(INPUT))
    .resolves.toBeUndefined();
  expect(state.query.mock.calls[0]?.[0]).toContain(
    "public.cmd_transition_payment_attempt_v1(",
  );
  expect(state.query.mock.calls[0]?.[0]).toContain(
    "$1::uuid,$2::uuid,'handed_off'::text,null::text,null::text",
  );
  expect(state.query.mock.calls[0]?.[1]).toEqual([SUBJECT,ATTEMPT]);
 });
 it('rejects guest and malformed request IDs without any database work',async()=>{
  for(const invalid of [
    {...INPUT,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'unit-test'}},
    {...INPUT,paymentAttemptId:'invalid'},
    {...INPUT,providerRequestId:'invalid id'},
  ])await expect(commitCloudflareOwnerPortOneSandboxHandoffV1(
    invalid as typeof INPUT,
  )).rejects.toThrow('Owner sandbox payment handoff state unavailable.');
  expect(state.execute).not.toHaveBeenCalled();
 });
 it('never claims success for a different PSP, environment, attempt or SDK identity',async()=>{
  for(const change of [
    {status:'created'},{status:'cancelled'},{provider:'another_provider'},
    {environment:'production'},{paymentAttemptId:SUBJECT},
    {providerRequestId:'injected_browser_payment_id'},
  ]){
    state.query.mockResolvedValueOnce({rows:[{
      paymentAttemptId:ATTEMPT,provider:'portone_v2',environment:'sandbox',
      providerRequestId:PAYMENT_ID,status:'handed_off',...change,
    }]});
    await expect(commitCloudflareOwnerPortOneSandboxHandoffV1(INPUT))
      .rejects.toThrow('Owner sandbox payment handoff state unavailable.');
  }
 });
});
