// Watchtower-Track: security
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe,expect,it,vi } from 'vitest';
import { handleSeyeonPlannerDecisionNodeHttpS0V1 } from
  '../apps/api/src/seyeon-planner-memory-decision-node-http-s0-v1.js';

const AUTH='11111111-1111-4111-8111-111111111111';
const SUBJECT='22222222-2222-4222-8222-222222222222';
const PROPOSAL='33333333-3333-4333-8333-333333333333';

async function send(input:{
  pool:{connect:()=>Promise<{query:(sql:string,values?:readonly unknown[])=>Promise<{rows:readonly unknown[]}>;release:()=>void}>};
  authorization?:boolean;
  choice?:unknown;
}){
  const server=createServer((incoming,response)=>{
    void handleSeyeonPlannerDecisionNodeHttpS0V1({
      incoming,response,pool:input.pool as never,
      requestId:'isolated-decision-s0',
      identityEvidenceVerifier:{verifyRequestIdentity:async(request)=>
        request.headers.get('authorization')==='Bearer synthetic'
          ?{kind:'member' as const,verifiedAuthUserId:AUTH}:null},
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+
      String((server.address() as AddressInfo).port)+
      '/api/memory/proposals/'+PROPOSAL+'/decision';
    const resp=await fetch(url,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(input.authorization?{Authorization:'Bearer synthetic'}:{}),
      },
      body:JSON.stringify(input.choice??{choice:{mode:'discard'}}),
    });
    return {status:resp.status,body:await resp.text()};
  }finally{
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
}

describe('UC-07 direct Node S0 decision cannot reach production DB',()=>{
  it('refuses a production-like DB before any Proposal or Memory/Grant owner RPC',async()=>{
    const calls:string[]=[];
    const query=vi.fn(async(sql:string,_values?:readonly unknown[])=>{
      calls.push(sql);
      if(sql.includes('begin_member_subject_context_v1')){
        return {rows:[{subjectId:SUBJECT,subjectKind:'member'}]};
      }
      if(sql.includes('current_database()')){
        return {rows:[{dbName:'myeongha_production'}]};
      }
      return {rows:[]};
    });
    const release=vi.fn();
    const pool={connect:vi.fn(async()=>({query,release}))};
    const result=await send({pool,authorization:true});
    expect(result.status).toBe(503);
    expect(result.body).not.toContain(PROPOSAL);
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(calls.some(x=>x.includes('qry_seyeon_pending_planner_memory_decision_v1'))).toBe(false);
    expect(calls.some(x=>x.includes('cmd_accept_seyeon_private_conversation_recall_proposal_v1'))).toBe(false);
    expect(calls.some(x=>x.includes('cmd_resolve_pending_planner'))).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects unapproved body and missing Member with zero DB calls',async()=>{
    const connect=vi.fn();
    const pool={connect} as never;
    const forged=await send({pool,authorization:true,
      choice:{choice:{mode:'discard'},summary:'user said secret'}});
    expect(forged.status).toBe(400);
    const anon=await send({pool});
    expect(anon.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});
