// Watchtower-Track: security
import {describe,expect,it,vi} from 'vitest';
import {createRecordsMemoryGrantConsentClient} from './records-memory-grant-consent.js';

const MEMORY='22222222-2222-4222-8222-222222222222';
const ack={ok:true,data:{memoryItemId:MEMORY,characterId:'seyeon',
  currentlyGranted:true,grantState:'active'},
  meta:{apiContractVersion:'v0.9',requestId:'consent',serverTime:'2026-10-30T00:00:00Z'}};
function subject(kind='member'){
  const fetchImpl=vi.fn(async()=>Response.json(ack));
  const client=createRecordsMemoryGrantConsentClient({
    fetchImpl,resolveBearer:()=>({kind,token:'current-member-token'}),
  });
  return {client,fetchImpl};
}

describe('S0 original Memory separate Member consent client',()=>{
  it('sends exact Se-yeon-only consent, never grants private storage implicitly',async()=>{
    const {client,fetchImpl}=subject();
    await expect(client.grantSeyeonOriginalMemory(MEMORY)).resolves.toEqual({
      memoryItemId:MEMORY,characterId:'seyeon',
      currentlyGranted:true,grantState:'active',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url,options]=fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/memories/${MEMORY}/grants/seyeon`);
    expect(options).toMatchObject({
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json',
        Authorization:'Bearer current-member-token'},
    });
    expect(JSON.parse(options.body as string)).toEqual({
      grantChoice:{mode:'character_only',characterId:'seyeon'},
    });
  });
  it('denies guest and malformed identifiers without transport',async()=>{
    const guest=subject('guest');
    await expect(guest.client.grantSeyeonOriginalMemory(MEMORY)).rejects.toMatchObject({
      code:'MEMORY_CONSENT_MEMBER_REQUIRED',
    });
    expect(guest.fetchImpl).not.toHaveBeenCalled();
    const member=subject();
    await expect(member.client.grantSeyeonOriginalMemory('not-a-uuid')).rejects.toMatchObject({
      code:'MEMORY_CONSENT_INVALID_ID',
    });
    expect(member.fetchImpl).not.toHaveBeenCalled();
  });
  it('never infers a grant from an unmounted route or failed response',async()=>{
    for (const response of [
      new Response(null,{status:404}),
      new Response(null,{status:503}),
      Response.json({ok:true,data:{...ack.data,characterId:'other'}}),
      Response.json({ok:true,data:{...ack.data,currentlyGranted:false}}),
      Response.json({ok:false,error:{code:'REJECTED',retryable:false}}),
    ]){
      const fetchImpl=vi.fn(async()=>response);
      const client=createRecordsMemoryGrantConsentClient({
        fetchImpl,resolveBearer:()=>({kind:'member',token:'current'}),
      });
      await expect(client.grantSeyeonOriginalMemory(MEMORY)).rejects.toMatchObject({
        code:'MEMORY_CONSENT_UNCONFIRMED',
      });
    }
  });
  it('rejects successful response when the Member session was replaced',async()=>{
    let calls=0;
    const client=createRecordsMemoryGrantConsentClient({
      fetchImpl:async()=>Response.json(ack),
      resolveBearer:()=>({kind:'member',token:++calls===1?'original':'changed'}),
    });
    await expect(client.grantSeyeonOriginalMemory(MEMORY)).rejects.toMatchObject({
      code:'MEMORY_CONSENT_SESSION_CHANGED',
    });
  });
});
