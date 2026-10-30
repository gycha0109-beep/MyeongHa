// Watchtower-Track: security
import {describe,expect,it,vi} from 'vitest';
import {
  SEYEON_ORIGINAL_MESSAGE_PROPOSAL_HTTP_V1,
  handleSeyeonOriginalMessageProposalRequestV1,
} from '../apps/api/src/seyeon-original-message-proposal-http-v1.js';
import {
  proposeSeyeonOriginalUserMessageV1,
} from '../apps/api/src/postgres-seyeon-original-message-proposal-v1.js';

const ID='11111111-1111-4111-8111-111111111111';
const T='22222222-2222-4222-8222-222222222222';
const M='33333333-3333-4333-8333-333333333333';
const P='44444444-4444-4444-8444-444444444444';
const URL=`https://example.invalid/api/chat/${ID}/turns/${T}/messages/${M}/memory-proposal`;
const meta={requestId:'s0-source-only',serverTime:'2026-10-30T00:00:00Z'};
const member={kind:'member' as const,verifiedAuthUserId:ID};
const pool={connect:vi.fn(()=>{throw Error('DB access forbidden');})};
const choice={proposalChoice:'private_original_message'};
function request(body:unknown=choice,url=URL){
  return new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)});
}
function verifier(){
  return {verifyRequestIdentity:vi.fn(async()=>member)};
}

describe('S0 unmounted original message proposal HTTP',()=>{
  it('does not open the private proposal writer without server admission',async()=>{
    const verify=verifier(),propose=vi.fn();
    const result=await handleSeyeonOriginalMessageProposalRequestV1({
      request:request(),...meta,pool,identityEvidenceVerifier:verify,propose,
    });
    expect(SEYEON_ORIGINAL_MESSAGE_PROPOSAL_HTTP_V1.publicRouteMounted).toBe(false);
    expect(result.status).toBe(503);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(propose).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it('never accepts text, schema, subject, or a different choice from the browser',async()=>{
    const cases=[
      {},{proposalChoice:'character_only'},{proposalChoice:'private_original_message',summary:'forged'},
      {proposalChoice:'private_original_message',subjectId:ID},
      {proposalChoice:{mode:'private'}},
    ];
    for(const body of cases){
      const verify=verifier(),propose=vi.fn();
      const res=await handleSeyeonOriginalMessageProposalRequestV1({
        request:request(body),...meta,pool,identityEvidenceVerifier:verify,
        approvedDbWriteAdmission:()=>true,propose,
      });
      expect(res.status).toBe(400);
      expect(verify.verifyRequestIdentity).not.toHaveBeenCalled();
      expect(propose).not.toHaveBeenCalled();
    }
  });
  it('rejects cross-scope route IDs and credentials before writing',async()=>{
    const invalid=[URL+'?subjectId='+ID,
      'https://example.invalid/api/chat/not-a-uuid/turns/'+T+'/messages/'+M+'/memory-proposal'];
    for(const url of invalid){
      const verify=verifier();
      const res=await handleSeyeonOriginalMessageProposalRequestV1({
        request:request(choice,url),...meta,pool,identityEvidenceVerifier:verify,
      });
      expect(res.status).toBe(404);
      expect(verify.verifyRequestIdentity).not.toHaveBeenCalled();
    }
    for(const evidence of [null,{kind:'guest' as const,verifiedGuestTokenHash:'guest'}]){
      const approve=vi.fn(()=>true);
      const res=await handleSeyeonOriginalMessageProposalRequestV1({
        request:request(),...meta,pool,
        identityEvidenceVerifier:{verifyRequestIdentity:async()=>evidence},
        approvedDbWriteAdmission:approve,
      });
      expect(res.status).toBe(evidence===null?401:403);
      expect(approve).not.toHaveBeenCalled();
    }
  });
  it('returns only a private pending receipt after an exact server-issued proposal',async()=>{
    const propose=vi.fn(async ({subjectOwnedSource}:{subjectOwnedSource:{proposalId:string}})=>({
      proposalId:subjectOwnedSource.proposalId,proposalState:'pending' as const,replayed:false,
    }));
    const res=await handleSeyeonOriginalMessageProposalRequestV1({
      request:request(),...meta,pool,identityEvidenceVerifier:verifier(),
      approvedDbWriteAdmission:()=>true,propose,
    });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({
      proposalKind:'memory',proposalState:'pending',shareState:'private_not_accepted',
    });
    expect(propose).toHaveBeenCalledTimes(1);
    const args=propose.mock.calls[0]?.[0] as unknown as {
      subjectOwnedSource:{threadId:string;turnId:string;messageId:string};
    };
    expect(args.subjectOwnedSource).toMatchObject({threadId:ID,turnId:T,messageId:M});
    expect(pool.connect).not.toHaveBeenCalled();
  });
  it('rejects forged or stale proposal receipts',async()=>{
    const res=await handleSeyeonOriginalMessageProposalRequestV1({
      request:request(),...meta,pool,identityEvidenceVerifier:verifier(),
      approvedDbWriteAdmission:()=>true,
      propose:async()=>({proposalId:P,proposalState:'pending',replayed:false}),
    });
    expect(res.status).toBe(503);
  });
});

describe('S0 original proposal PostgreSQL port',()=>{
  it('passes only five exact identifiers and accepts one bounded receipt',async()=>{
    const query=vi.fn(async(_sql:string,params?:unknown[])=>({
      rows:[{proposalId:P,proposalState:'pending',replayed:false}],
    }));
    const client={query};
    await expect(proposeSeyeonOriginalUserMessageV1(client as never,{
      subjectId:ID,threadId:T,turnId:T,messageId:M,proposalId:P,
    })).resolves.toEqual({proposalId:P,proposalState:'pending',replayed:false});
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual([ID,T,T,M,P]);
    expect(query.mock.calls[0]?.[0]).not.toContain('summary');
  });
  it('fails before DB for invalid IDs and refuses unrelated receipts',async()=>{
    const query=vi.fn(async()=>({rows:[{proposalId:ID,proposalState:'pending',replayed:false}]}));
    const client={query};
    await expect(proposeSeyeonOriginalUserMessageV1(client as never,{
      subjectId:ID,threadId:T,turnId:T,messageId:'invalid',proposalId:P,
    })).rejects.toMatchObject({code:'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE'});
    expect(query).not.toHaveBeenCalled();
    await expect(proposeSeyeonOriginalUserMessageV1(client as never,{
      subjectId:ID,threadId:T,turnId:T,messageId:M,proposalId:P,
    })).rejects.toMatchObject({code:'SEYEON_ORIGINAL_MESSAGE_PROPOSAL_UNAVAILABLE'});
  });
});
