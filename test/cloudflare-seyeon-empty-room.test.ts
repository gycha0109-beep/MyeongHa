import { describe, expect, it } from 'vitest';
import { admitCloudflareSeyeonEmptyRoomV1 } from '../workers/cloudflare-seyeon-empty-room.mjs';

const threadId='123e4567-e89b-42d3-a456-426614174000';
const release='223e4567-e89b-42d3-a456-426614174000';
const bundle='323e4567-e89b-42d3-a456-426614174000';
const path=`https://myeongha.gycha0109.workers.dev/api/chat/${threadId}`;
const room={
  threadId, characterId:'seyeon', contentReleaseId:release,
  contentBundleId:bundle, contentRevision:1,
  afterSequenceNo:0, lastSequenceNo:0, messages:[],
  pagination:{pageSize:50,hasMore:false,nextAfterSequenceNo:null},
  latestCharacterMessage:null,
  relationship:{currentAffinity:99999,privateTranscript:'NEVER_PUBLIC'},
};
const candidate=(data:object,status=200)=>
  Response.json({ok:true,data,meta:{apiContractVersion:'v0.9'}},
    {status,headers:{'Cache-Control':'no-store'}});

describe('Se-yeon empty-room Edge egress admission',()=>{
  it('returns only an owner-read first-page empty shell and strips relationship state',async()=>{
    const request=new Request(path);
    const response=await admitCloudflareSeyeonEmptyRoomV1(request,candidate(room),threadId);
    expect(response?.status).toBe(200);
    const text=await response!.text();
    expect(text).not.toContain('NEVER_PUBLIC');
    expect(text).not.toContain('99999');
    const json=JSON.parse(text);
    expect(json.data).toMatchObject({threadId,characterId:'seyeon',messages:[],
      relationship:null,latestCharacterMessage:null,pagination:{hasMore:false}});
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(response?.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('holds nonempty, replay, cross-thread and ambiguous owner-read responses',async()=>{
    const cases=[
      [path,{...room,messages:[{bodyText:'PRIVATE_HISTORY_CANARY'}]}],
      [path,{...room,characterId:'yeoul'}],
      [path,{...room,threadId:'423e4567-e89b-42d3-a456-426614174000'}],
      [path,{...room,lastSequenceNo:1}],
      [path,{...room,pagination:{...room.pagination,hasMore:true}}],
      [path+'?afterSequenceNo=1',room],
      [path+'?afterSequenceNo=0&afterSequenceNo=0',room],
      [path+'?__myeongha_chat_thread_id='+threadId,room],
    ] as const;
    for (const [url,data] of cases){
      expect(await admitCloudflareSeyeonEmptyRoomV1(
        new Request(url),candidate(data),threadId)).toBeNull();
    }
    expect(await admitCloudflareSeyeonEmptyRoomV1(
      new Request(path),candidate(room,503),threadId)).toBeNull();
    expect(await admitCloudflareSeyeonEmptyRoomV1(
      new Request(path),new Response('NOT JSON',{headers:{'Content-Type':'text/html'}}),threadId)).toBeNull();
  });
});
