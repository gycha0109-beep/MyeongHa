import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {createRecordsRuntimeClient} from './records-runtime-client.js';

const MEMORY='22222222-2222-4222-8222-222222222222';
const META={apiContractVersion:'v0.9',requestId:'s0-lifecycle-test',serverTime:'2026-10-29T00:00:00Z'};
const base={memoryItemId:MEMORY,characterId:'seyeon',currentlyGranted:false,grantedAt:null};
function client(data:Record<string,unknown>){
  const fetchImpl=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({ok:true,data,meta:META}));
  return {runtime:createRecordsRuntimeClient({fetchImpl,resolveBearer:()=>({
    kind:'member',token:'member-token',
  })}),fetchImpl};
}

describe('Records S0 owner withdrawal lifecycle',()=>{
  it('keeps DB-confirmed pending blocked after every fresh GET',async()=>{
    const {runtime,fetchImpl}=client({...base,grantState:'withdrawal_pending'});
    await expect(runtime.readSeyeonMemoryGrantStatus(MEMORY)).resolves.toEqual({
      memoryItemId:MEMORY,currentlyGranted:false,grantedAt:null,grantState:'withdrawal_pending',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/grants/seyeon');
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method:'GET',credentials:'same-origin',cache:'no-store',
    });
  });
  it('only an authoritative not_granted state proves completed withdrawal',async()=>{
    const {runtime}=client({...base,grantState:'not_granted'});
    await expect(runtime.readSeyeonMemoryGrantStatus(MEMORY)).resolves.toMatchObject({
      grantState:'not_granted',currentlyGranted:false,
    });
  });
  it('never equates legacy RLS-filtered false with completed revocation',async()=>{
    const {runtime}=client({...base});
    await expect(runtime.readSeyeonMemoryGrantStatus(MEMORY)).resolves.toMatchObject({
      grantState:'unknown',currentlyGranted:false,
    });
  });
  it('accepts active authority only with valid original grant timestamp',async()=>{
    const {runtime}=client({...base,grantState:'active',
      currentlyGranted:true,grantedAt:'2026-10-21T00:00:00Z'});
    await expect(runtime.readSeyeonMemoryGrantStatus(MEMORY)).resolves.toMatchObject({
      grantState:'active',currentlyGranted:true,
    });
  });
  it('fails closed for contradictory lifecycle and current grant snapshots',async()=>{
    const wrong=[
      {...base,grantState:'active'},
      {...base,grantState:'withdrawal_pending',currentlyGranted:true},
      {...base,grantState:'not_granted',grantedAt:'2026-10-21T00:00:00Z'},
      {...base,grantState:'future_state'},
      {...base,grantState:'unknown',currentlyGranted:true},
    ];
    for(const data of wrong){
      const {runtime}=client(data);
      await expect(runtime.readSeyeonMemoryGrantStatus(MEMORY)).rejects.toMatchObject({
        code:'WEB_RECORDS_MALFORMED_RESPONSE',
      });
    }
  });
  it('requires the current server state for the UI rather than session storage',()=>{
    const page=readFileSync(new URL('./records-page.js',import.meta.url),'utf8');
    expect(page).toContain("result.grantState === 'withdrawal_pending'");
    expect(page).toContain("result.grantState === 'not_granted'");
    expect(page).toContain("result.grantState === 'unknown'");
    expect(page).toContain("presentSeyeonMemoryGrantStatusV1(");
    expect(page).toContain("lastGrantState !== 'active'");
    expect(page).toContain("revoke.hidden = !view.revokeAvailable");
  });
});
