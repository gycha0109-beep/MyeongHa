// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import {
  createSeyeonPrivateMemoryReviewClientV1,
} from './seyeon-private-memory-review-client.js';
import { mountSeyeonPrivateMemoryReviewV1 } from './seyeon-private-memory-review-view.js';
import {readFileSync} from 'node:fs';

const THREAD = '11111111-1111-4111-8111-111111111111';
const TURN = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const PROPOSAL = '44444444-4444-4444-8444-444444444444';
const MEMORY = '55555555-5555-4555-8555-555555555555';
const SOURCE = { threadId: THREAD, turnId: TURN, messageId: MESSAGE };
const META = {
  apiContractVersion: 'v0.9',
  requestId: 's0-member-review',
  serverTime: '2026-10-30T00:00:00Z',
};
const pending = { proposalId: PROPOSAL, proposalKind: 'memory',
  proposalState: 'pending', shareState: 'private_not_accepted' };
const accepted = { memoryItemId: MEMORY, grantCount: 0, replayed: false };
const envelope = (data:unknown, status=200) =>
  Response.json({ ok:true, data, meta:META }, {status});

function setup() {
  const fetchImpl = vi.fn(async (_url:string, _init?:RequestInit) =>
    envelope(pending, 201));
  const client = createSeyeonPrivateMemoryReviewClientV1({
    fetchImpl, resolveBearer: () => ({ kind:'member', token:'member-v1' }),
  });
  return {client,fetchImpl};
}

describe('S0 private Memory: two distinct Member choices, no implicit character Grant', () => {
  it('creates an original-source pending proposal, never an approved Memory or Grant', async () => {
    const {client,fetchImpl} = setup();
    const receipt = await client.prepareOriginalUserMessage(SOURCE);
    expect(receipt).toEqual(pending);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/chat/${THREAD}/turns/${TURN}/messages/${MESSAGE}/memory-proposal`);
    expect(init).toMatchObject({
      method:'POST', cache:'no-store', credentials:'same-origin',
      headers:{Authorization:'Bearer member-v1','Content-Type':'application/json'},
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      proposalChoice:'private_original_message',
    });
    expect(receipt).not.toHaveProperty('memoryItemId');
    expect(receipt).not.toHaveProperty('grantId');
  });

  it('demands a SECOND explicit Member choice and sends private-only accept',async()=>{
    const {client,fetchImpl}=setup();
    const receipt=await client.prepareOriginalUserMessage(SOURCE);
    fetchImpl.mockImplementationOnce(async()=>envelope(accepted));
    await expect(client.acceptPreparedPrivate(receipt, false)).rejects.toMatchObject({
      code:'SEYEON_PRIVATE_MEMORY_NOT_APPROVED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(client.acceptPreparedPrivate(receipt, true)).resolves.toEqual({
      memoryItemId:MEMORY, grantCount:0, shareState:'private_not_shared',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url,init]=fetchImpl.mock.calls[1]!;
    expect(url).toBe(`/api/memory/proposals/${PROPOSAL}/accept`);
    expect(init).toMatchObject({
      method:'POST',cache:'no-store',credentials:'same-origin',
      headers:{Authorization:'Bearer member-v1'},
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      grantChoice:{mode:'private'},
    });
    expect(await Promise.resolve(client.acceptPreparedPrivate(receipt,true))
      .then(()=>null,e=>e.code)).toBe('SEYEON_PRIVATE_MEMORY_NOT_APPROVED');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('rejects forged proposal receipts even with a real pending id',async()=>{
    const {client,fetchImpl}=setup();
    const receipt=await client.prepareOriginalUserMessage(SOURCE);
    await expect(client.acceptPreparedPrivate({...receipt},true)).rejects.toMatchObject({
      code:'SEYEON_PRIVATE_MEMORY_NOT_APPROVED',
    });
    await expect(client.acceptPreparedPrivate({
      ...receipt,shareState:'active' as never,
    },true)).rejects.toMatchObject({code:'SEYEON_PRIVATE_MEMORY_NOT_APPROVED'});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects extra content, invalid original IDs, and guests before transport',async()=>{
    const {client,fetchImpl}=setup();
    await expect(client.prepareOriginalUserMessage({...SOURCE,summary:'injected'}))
      .rejects.toMatchObject({code:'SEYEON_MEMORY_REVIEW_SOURCE_INVALID'});
    await expect(client.prepareOriginalUserMessage({...SOURCE,messageId:'forged'}))
      .rejects.toMatchObject({code:'SEYEON_MEMORY_REVIEW_SOURCE_INVALID'});
    expect(fetchImpl).not.toHaveBeenCalled();
    const guest=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl,resolveBearer:()=>({kind:'guest',token:'guest-v1'}),
    });
    await expect(guest.prepareOriginalUserMessage(SOURCE)).rejects.toMatchObject({
      code:'SEYEON_MEMORY_REVIEW_MEMBER_REQUIRED',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed if server has no mounted route or returns a forged proposal',async()=>{
    for(const response of [
      new Response(null,{status:404}),
      new Response(null,{status:503}),
      envelope({...pending,proposalState:'accepted'},201),
      envelope({...pending,shareState:'granted'},201),
      envelope({...pending,memoryItemId:MEMORY},201),
      Response.json({ok:false,error:{code:'HOLD'},meta:META},{status:201}),
    ]){
      const fetchImpl=vi.fn(async()=>response);
      const client=createSeyeonPrivateMemoryReviewClientV1({
        fetchImpl,resolveBearer:()=>({kind:'member',token:'member'}),
      });
      await expect(client.prepareOriginalUserMessage(SOURCE)).rejects.toMatchObject({
        code:'SEYEON_MEMORY_PROPOSAL_UNCONFIRMED',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('never accepts a forged zero-Grant success or retries an uncertain acceptance',async()=>{
    for(const value of [
      {...accepted,grantCount:1},
      {...accepted,replayed:true},
      {...accepted,characterId:'seyeon'},
      {...accepted,grantId:PROPOSAL},
      {...accepted,memoryItemId:'wrong'},
    ]){
      const {client,fetchImpl}=setup();
      const receipt=await client.prepareOriginalUserMessage(SOURCE);
      fetchImpl.mockImplementationOnce(async()=>envelope(value));
      await expect(client.acceptPreparedPrivate(receipt,true)).rejects.toMatchObject({
        code:'SEYEON_PRIVATE_MEMORY_ACCEPT_UNCONFIRMED',
      });
      await expect(client.acceptPreparedPrivate(receipt,true)).rejects.toMatchObject({
        code:'SEYEON_PRIVATE_MEMORY_NOT_APPROVED',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
    const {client,fetchImpl}=setup();
    const receipt=await client.prepareOriginalUserMessage(SOURCE);
    fetchImpl.mockImplementationOnce(async()=>{throw Error('lost acknowledgement');});
    await expect(client.acceptPreparedPrivate(receipt,true)).rejects.toMatchObject({
      code:'SEYEON_PRIVATE_MEMORY_ACCEPT_UNCONFIRMED',
    });
    await expect(client.acceptPreparedPrivate(receipt,true)).rejects.toMatchObject({
      code:'SEYEON_PRIVATE_MEMORY_NOT_APPROVED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not accept if the Member session changes after proposal creation',async()=>{
    let current='member-a';
    const fetchImpl=vi.fn(async(_url:string,_init?:RequestInit)=>envelope(pending,201));
    const client=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl,resolveBearer:()=>({kind:'member',token:current}),
    });
    const receipt=await client.prepareOriginalUserMessage(SOURCE);
    current='member-b';
    await expect(client.acceptPreparedPrivate(receipt,true)).rejects.toMatchObject({
      code:'SEYEON_MEMORY_REVIEW_SESSION_CHANGED',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge a response after the Member session rotates',async()=>{
    let calls=0;
    const client=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl:async()=>envelope(pending,201),
      resolveBearer:()=>({kind:'member',token:++calls===1?'member-a':'member-b'}),
    });
    await expect(client.prepareOriginalUserMessage(SOURCE)).rejects.toMatchObject({
      code:'SEYEON_MEMORY_REVIEW_SESSION_CHANGED',
    });
  });
});

describe('S0 browser review surface activation boundary',()=>{
  it('cannot mount without an exact server-owned original source offer',()=>{
    vi.stubGlobal('HTMLElement',class HTMLElement {});
    try {
      const instance=new (globalThis.HTMLElement as typeof HTMLElement)();
      Object.defineProperty(instance,'isConnected',{value:true});
      for(const originalSource of [
        null,
        {...SOURCE,characterId:'seyeon',redacted:false},
        {...SOURCE,sourceAuthority:'server_original_message',characterId:'other',redacted:false},
        {...SOURCE,sourceAuthority:'server_original_message',characterId:'seyeon',redacted:true},
      ]){
        expect(mountSeyeonPrivateMemoryReviewV1({
          container:instance,originalSource,
        } as never)).toBeNull();
      }
    }finally{vi.unstubAllGlobals();}
  });
  it('does not activate proposal creation or approval in unverified Chat history',()=>{
    const chat=readFileSync(new URL('./chat-runtime-client.js',import.meta.url),'utf8');
    const records=readFileSync(new URL('./records-page.js',import.meta.url),'utf8');
    expect(chat).not.toContain('mountSeyeonPrivateMemoryReviewV1');
    expect(records).not.toContain('mountSeyeonPrivateMemoryReviewV1');
  });
});
