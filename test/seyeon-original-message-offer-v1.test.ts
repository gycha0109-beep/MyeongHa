// Watchtower-Track: security
import {describe,expect,it,vi} from 'vitest';
import {
  readSeyeonOriginalMessageReviewOfferV1,
  SEYEON_ORIGINAL_MEMORY_OFFER_V1,
} from '../apps/api/src/postgres-seyeon-original-message-offer-v1.js';

const SUBJECT='11111111-1111-4111-8111-111111111111';
const THREAD='22222222-2222-4222-8222-222222222222';
const TURN='33333333-3333-4333-8333-333333333333';
const MESSAGE='44444444-4444-4444-8444-444444444444';

function input(approved=true) {
  return {
    subjectId:SUBJECT,threadId:THREAD,messageId:MESSAGE,
    revealedSource:{
      threadId:THREAD,messageId:MESSAGE,senderType:'user' as const,
      characterId:'seyeon' as const,redacted:false as const,
      historyWithheld:false as const,memberReadAllowed:true as const,
    },
    ...(approved?{approvedHistoryReveal:()=>true}:{}),
  };
}

describe('S0 server-owned original source offer (not G3 permission)',()=>{
  it('remains unmounted and fails before querying unless current Member G3 is approved',async()=>{
    expect(SEYEON_ORIGINAL_MEMORY_OFFER_V1.productionMounted).toBe(false);
    const query=vi.fn(async()=>({rows:[]}));
    const client={query};
    await expect(readSeyeonOriginalMessageReviewOfferV1(client,input(false)))
      .rejects.toMatchObject({code:'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE'});
    await expect(readSeyeonOriginalMessageReviewOfferV1(client,{
      ...input(),approvedHistoryReveal:()=>false,
    })).rejects.toMatchObject({code:'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE'});
    await expect(readSeyeonOriginalMessageReviewOfferV1(client,{
      ...input(),approvedHistoryReveal:()=>{throw Error('G3 blocked');},
    })).rejects.toMatchObject({code:'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE'});
    expect(query).not.toHaveBeenCalled();
  });

  it('looks up exactly one source from DB, never body text or Grant',async()=>{
    const query=vi.fn(async(_sql:string,_params?:unknown[])=>({
      rows:[{threadId:THREAD,turnId:TURN,messageId:MESSAGE}],
    }));
    const result=await readSeyeonOriginalMessageReviewOfferV1({query},input());
    expect(result).toEqual({
      sourceAuthority:'server_original_message',
      characterId:'seyeon',redacted:false,
      threadId:THREAD,turnId:TURN,messageId:MESSAGE,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql,params]=query.mock.calls[0]!;
    expect(params).toEqual([SUBJECT,THREAD,MESSAGE]);
    expect(sql).toContain('qry_seyeon_original_message_offer_v1');
    expect(sql).not.toContain('body_text');
    expect(result).not.toHaveProperty('bodyText');
    expect(result).not.toHaveProperty('grantId');
  });

  it('returns no offer on DB ineligibility and refuses corrupted identity rows',async()=>{
    const noRow={query:vi.fn(async()=>({rows:[]}))};
    await expect(readSeyeonOriginalMessageReviewOfferV1(noRow,input())).resolves.toBeNull();
    for(const rows of [
      [{threadId:THREAD,turnId:'not-a-uuid',messageId:MESSAGE}],
      [{threadId:THREAD,turnId:TURN,messageId:SUBJECT}],
      [{threadId:SUBJECT,turnId:TURN,messageId:MESSAGE}],
      [{threadId:THREAD,turnId:TURN,messageId:MESSAGE},
       {threadId:THREAD,turnId:TURN,messageId:MESSAGE}],
    ]){
      const client={query:vi.fn(async()=>({rows}))};
      await expect(readSeyeonOriginalMessageReviewOfferV1(client,input()))
        .rejects.toMatchObject({code:'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE'});
    }
  });

  it('rejects unconfirmed/Guest/redacted/foreign message origins before DB',async()=>{
    const query=vi.fn(async()=>({rows:[]}));
    const client={query};
    const unsafe=[
      {...input(),subjectId:'invalid'},
      {...input(),revealedSource:{...input().revealedSource,threadId:SUBJECT}},
      {...input(),revealedSource:{...input().revealedSource,messageId:SUBJECT}},
      {...input(),revealedSource:{...input().revealedSource,senderType:'character' as never}},
      {...input(),revealedSource:{...input().revealedSource,characterId:'other' as never}},
      {...input(),revealedSource:{...input().revealedSource,redacted:true as never}},
      {...input(),revealedSource:{...input().revealedSource,historyWithheld:true as never}},
      {...input(),revealedSource:{...input().revealedSource,memberReadAllowed:false as never}},
    ];
    for(const caseInput of unsafe){
      await expect(readSeyeonOriginalMessageReviewOfferV1(client,caseInput))
        .rejects.toMatchObject({code:'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE'});
    }
    expect(query).not.toHaveBeenCalled();
  });
});
