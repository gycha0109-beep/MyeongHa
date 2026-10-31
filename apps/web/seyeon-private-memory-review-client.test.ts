// Watchtower-Track: security
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createSeyeonPrivateMemoryReviewClientV1,
  isServerPlannerMemoryProposalV1,
} from './seyeon-private-memory-review-client.js';
import { mountSeyeonPrivateMemoryReviewV1 } from './seyeon-private-memory-review-view.js';

const PROPOSAL = '44444444-4444-4444-8444-444444444444';
const candidate = Object.freeze({
  sourceAuthority: 'server_dialogue_planner' as const,
  characterId: 'seyeon' as const,
  proposalId: PROPOSAL,
  proposalKind: 'memory' as const,
  proposalState: 'pending' as const,
  summary: '사용자는 나비라는 고양이를 키운다',
});
const META = { apiContractVersion: 'v0.9', requestId: 'planner-decision',
  serverTime: '2026-10-30T00:00:00Z' };
const envelope = (data: unknown, status=200) =>
  Response.json({ok:true,data,meta:META},{status});
const ack = (decision: string) => ({
  proposalId:PROPOSAL,decision,status:'resolved',
  persisted:decision==='character_only'||decision==='current_characters',
  grantCount:decision==='character_only'?1:decision==='current_characters'?2:0,
});

describe('UC-06/07 server Planner Memory Proposal decisions', () => {
  it('does not create candidates from user Message text, IDs or browser summary', () => {
    expect(isServerPlannerMemoryProposalV1(candidate)).toBe(true);
    for (const wrong of [
      null,
      { ...candidate, sourceAuthority:'server_original_message' },
      { ...candidate, proposalState:'accepted' },
      { ...candidate, proposalId:'not-a-uuid' },
      { ...candidate, summary:' ' },
      { ...candidate, summary:'<fake>', rawBody:'client injected' },
      { ...candidate, characterId:'other' },
    ]) expect(isServerPlannerMemoryProposalV1(wrong)).toBe(false);
  });

  for(const choice of ['session_only','character_only','current_characters','discard'] as const) {
    it(`accepts explicit ${choice} only with exact server receipt, without user content`,async()=>{
      const fetchImpl=vi.fn(async(_path:string,_init?:RequestInit)=>envelope(ack(choice)));
      const client=createSeyeonPrivateMemoryReviewClientV1({
        fetchImpl, resolveBearer:()=>({kind:'member',token:'member-a'}),
      });
      const receipt=await client.decidePlannerProposal(candidate,choice,true);
      expect(receipt).toEqual(ack(choice));
      const [url,init]=fetchImpl.mock.calls[0]!;
      expect(url).toBe(`/api/memory/proposals/${PROPOSAL}/decision`);
      expect(init).toMatchObject({ method:'POST',cache:'no-store',
        credentials:'same-origin',headers:{Authorization:'Bearer member-a'} });
      expect(JSON.parse(init!.body as string)).toEqual({
        choice:{mode:choice,...(choice==='character_only'?{characterId:'seyeon'}:{})},
      });
      expect(init!.body).not.toContain(candidate.summary);
      await expect(client.decidePlannerProposal(candidate,choice,true))
        .rejects.toMatchObject({code:'MEMORY_DECISION_NOT_APPROVED'});
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  }

  it('rejects guest, invalid choice, unconfirmed approval and fake origin before transport',async()=>{
    const fetchImpl=vi.fn(async()=>envelope(ack('discard')));
    const guest=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl,resolveBearer:()=>({kind:'guest',token:'guest-a'}),
    });
    await expect(guest.decidePlannerProposal(candidate,'discard',true))
      .rejects.toMatchObject({code:'MEMORY_DECISION_MEMBER_REQUIRED'});
    const member=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl,resolveBearer:()=>({kind:'member',token:'member-a'}),
    });
    await expect(member.decidePlannerProposal(candidate,'discard',false))
      .rejects.toMatchObject({code:'MEMORY_DECISION_NOT_APPROVED'});
    await expect(member.decidePlannerProposal(candidate,'private' as never,true))
      .rejects.toMatchObject({code:'MEMORY_DECISION_INVALID_PROPOSAL'});
    await expect(member.decidePlannerProposal({...candidate,sourceAuthority:'server_original_message'} as never,'discard',true))
      .rejects.toMatchObject({code:'MEMORY_DECISION_INVALID_PROPOSAL'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unmounted routes and mismatched/optimistic decision acknowledgements',async()=>{
    const responses=[
      new Response(null,{status:404}),
      new Response(null,{status:503}),
      envelope({...ack('character_only'),grantCount:0}),
      envelope({...ack('character_only'),persisted:false}),
      envelope({...ack('character_only'),grantId:PROPOSAL}),
      envelope({...ack('discard'),decision:'character_only'}),
      envelope({...ack('discard'),personalContent:'fake'}),
    ];
    for(const response of responses){
      const fetchImpl=vi.fn(async()=>response);
      const client=createSeyeonPrivateMemoryReviewClientV1({
        fetchImpl,resolveBearer:()=>({kind:'member',token:'member'}),
      });
      await expect(client.decidePlannerProposal(candidate,'discard',true))
        .rejects.toMatchObject({code:'MEMORY_DECISION_UNCONFIRMED'});
      await expect(client.decidePlannerProposal(candidate,'discard',true))
        .rejects.toMatchObject({code:'MEMORY_DECISION_NOT_APPROVED'});
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses a success ACK after Member identity rotated',async()=>{
    let calls=0;
    const client=createSeyeonPrivateMemoryReviewClientV1({
      fetchImpl:async()=>envelope(ack('discard')),
      resolveBearer:()=>({kind:'member',token:++calls===1?'a':'b'}),
    });
    await expect(client.decidePlannerProposal(candidate,'discard',true))
      .rejects.toMatchObject({code:'MEMORY_DECISION_SESSION_CHANGED'});
  });
});

describe('UC-07 browser review surface',()=>{
  it('does not mount from an original user message or forged candidate',()=>{
    vi.stubGlobal('HTMLElement',class HTMLElement {});
    try {
      const instance=new (globalThis.HTMLElement as typeof HTMLElement)();
      Object.defineProperty(instance,'isConnected',{value:true});
      for(const plannerProposal of [
        null,
        {sourceAuthority:'server_original_message',characterId:'seyeon'},
        {...candidate,summary:'',},
      ]){
        expect(mountSeyeonPrivateMemoryReviewV1({
          container:instance,plannerProposal,
        } as never)).toBeNull();
      }
    }finally{vi.unstubAllGlobals();}
  });
  it('erases unapproved summary and choice controls immediately after confirmed discard',async()=>{
    class FakeElement {
      className='';
      textContent='';
      isConnected=true;
      type='';
      disabled=false;
      dataset:Record<string,string>={};
      children:FakeElement[]=[];
      onClick:(()=>Promise<void>)|null=null;
      setAttribute(_name:string,_value:string){}
      addEventListener(name:string,handler:()=>Promise<void>) {
        if(name==='click')this.onClick=handler;
      }
      append(...nodes:FakeElement[]) {this.children.push(...nodes);}
      replaceChildren(...nodes:FakeElement[]) {this.children=[...nodes];}
      click() {return this.onClick?.();}
    }
    vi.stubGlobal('HTMLElement',FakeElement);
    vi.stubGlobal('document',{createElement:()=>new FakeElement()});
    vi.stubGlobal('window',{confirm:()=>true});
    try{
      let finish:((receipt:{proposalId:string;decision:string;status:string})=>void)|undefined;
      const client={
        decidePlannerProposal:vi.fn(()=>new Promise<{
          proposalId:string;decision:string;status:string;
        }>(resolve=>{finish=resolve;})),
      };
      const root=new FakeElement();
      const panel=mountSeyeonPrivateMemoryReviewV1({
        container:root,plannerProposal:candidate,client,
      } as never) as FakeElement|null;
      expect(panel).not.toBeNull();
      const summary=panel!.children.find(node=>
        node.className==='s0-memory-proposal-summary');
      const discard=panel!.children.find(node=>node.dataset.choice==='discard');
      expect(summary?.textContent).toBe(candidate.summary);
      expect(discard).toBeDefined();
      const submitted=discard!.click();
      expect(summary?.textContent).toBe('');
      expect(panel!.children).toHaveLength(1);
      expect(panel!.children[0]?.className).toBe('s0-memory-proposal-status');
      expect(discard!.disabled).toBe(true);
      expect(client.decidePlannerProposal).toHaveBeenCalledWith(candidate,'discard',true);
      finish!({proposalId:PROPOSAL,decision:'discard',status:'resolved'});
      await submitted;
      expect(panel!.children).toHaveLength(1);
      expect(summary?.textContent).toBe('');
    }finally {
      vi.unstubAllGlobals();
    }
  });

  it('Chat mounts only from server-owned Planner proposal with protected-history hold',()=>{
    const chat=readFileSync(new URL('./chat-runtime-client.js',import.meta.url),'utf8');
    const read=readFileSync(new URL('./chat-room-read-contract.js',import.meta.url),'utf8');
    const view=readFileSync(new URL('./seyeon-private-memory-review-view.js',import.meta.url),'utf8');
    expect(chat).toContain("if (!historyProtected && memberReadAllowed && authoritativeCharacterId === 'seyeon')");
    expect(chat).toContain('const proposal = messages[i]?.memoryProposal');
    expect(chat).toContain('plannerProposal: proposal');
    expect(chat).not.toContain('memoryProposalOffer');
    expect(read).toContain('serverPlannerMemoryProposal(message, roomCharacterId)');
    expect(read).toContain("fail('manual original-message Memory offer is unsupported')");
    expect(view).toContain("'session_only'");
    expect(view).toContain("'character_only'");
    expect(view).toContain("'current_characters'");
    expect(view).toContain("'discard'");
    expect(view).not.toContain('prepareOriginalUserMessage');
  });
});
