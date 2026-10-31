// Watchtower-Track: security
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  publishSeyeonMemoryVisibilityInvalidationV1,
  subscribeSeyeonMemoryVisibilityInvalidationV1,
  SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1,
} from './seyeon-memory-visibility-invalidation.js';
import { createRecordsMemoryGrantRevokeClient } from './records-memory-grant-revoke.js';

const MEMORY_ID = '22222222-2222-4222-8222-222222222222';
const makeAck = (status: 'pending'|'committed') => ({
  ok:true,
  meta: {
    apiContractVersion: 'v0.9',
    requestId: 'seyeon-memory-visibility-revoke-test',
    serverTime: '2026-11-01T00:00:00Z',
  },
  data:status==='pending'
    ?{status,memoryItemId:MEMORY_ID,characterId:'seyeon',newUseBlocked:true}
    :{status,memoryItemId:MEMORY_ID,characterId:'seyeon',
      revokedGrantCount:1,replayed:false},
});

afterEach(() => vi.unstubAllGlobals());

describe('Se-yeon current-grant browser presentation invalidation', () => {
  it('notifies this tab and other tabs without sending private text or Member IDs', async () => {
    const local = new EventTarget();
    vi.stubGlobal('window', local);
    const peers: FakeChannel[]=[];
    const outbound:unknown[]=[];
    class FakeChannel {
      listeners = new Set<(event:{data:unknown})=>void>();
      closed=false;
      constructor(readonly name:string) { peers.push(this); }
      addEventListener(_kind:string,fn:(event:{data:unknown})=>void){
        this.listeners.add(fn);
      }
      removeEventListener(_kind:string,fn:(event:{data:unknown})=>void){
        this.listeners.delete(fn);
      }
      postMessage(data:unknown){
        outbound.push(data);
        for (const peer of peers) {
          if(peer!==this && !peer.closed && peer.name===this.name){
            for(const fn of peer.listeners)fn({data});
          }
        }
      }
      close(){this.closed=true;}
    }
    vi.stubGlobal('BroadcastChannel',FakeChannel);
    const received=vi.fn();
    const localEvents=vi.fn();
    local.addEventListener(SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1,localEvents);
    const unsubscribe=subscribeSeyeonMemoryVisibilityInvalidationV1(received);
    expect(received).not.toHaveBeenCalled();

    const client=createRecordsMemoryGrantRevokeClient({
      resolveBearer:()=>({kind:'member',token:'member-credential'}),
      fetchImpl:vi.fn(async()=>Response.json(makeAck('pending'),{status:202})),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({
      status:'pending',newUseBlocked:true,
    });
    expect(received).toHaveBeenCalledTimes(2);
    expect(localEvents).toHaveBeenCalledTimes(1);
    expect(outbound).toEqual([{version:'v1',action:'invalidate'}]);
    expect(JSON.stringify(outbound)).not.toContain(MEMORY_ID);
    expect(JSON.stringify(outbound)).not.toContain('member-credential');
    unsubscribe();
    publishSeyeonMemoryVisibilityInvalidationV1();
    expect(received).toHaveBeenCalledTimes(2);
  });

  it('does not notify on missing Member, rejected receipt, or transport failure', async () => {
    const dispatchEvent=vi.fn((_event:Event)=>true);
    vi.stubGlobal('window',{dispatchEvent});
    vi.stubGlobal('BroadcastChannel',undefined);
    const invalid=createRecordsMemoryGrantRevokeClient({
      resolveBearer:()=>({kind:'guest',token:'guest'}),
      fetchImpl:vi.fn(),
    });
    await expect(invalid.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code:'MEMORY_REVOKE_MEMBER_REQUIRED',
    });
    const denied=createRecordsMemoryGrantRevokeClient({
      resolveBearer:()=>({kind:'member',token:'t'}),
      fetchImpl:async()=>new Response(null,{status:503}),
    });
    await expect(denied.revokeSeyeonMemoryGrant(MEMORY_ID)).rejects.toMatchObject({
      code:'MEMORY_REVOKE_UNCONFIRMED',
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('committed revoke also invalidates local presentation', async () => {
    const dispatchEvent=vi.fn((_event:Event)=>true);
    vi.stubGlobal('window',{dispatchEvent});
    vi.stubGlobal('BroadcastChannel',undefined);
    const client=createRecordsMemoryGrantRevokeClient({
      resolveBearer:()=>({kind:'member',token:'t'}),
      fetchImpl:async()=>Response.json(makeAck('committed')),
    });
    await expect(client.revokeSeyeonMemoryGrant(MEMORY_ID)).resolves.toMatchObject({
      status:'committed',
    });
    expect(dispatchEvent).toHaveBeenCalledOnce();
    expect(dispatchEvent.mock.calls[0]?.[0]?.type)
      .toBe(SEYEON_MEMORY_VISIBILITY_INVALIDATION_V1);
  });
});
