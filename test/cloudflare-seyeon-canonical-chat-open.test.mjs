import {describe,it,expect,vi,beforeEach} from 'vitest';

const genericChat=vi.fn(async request=>new Response(null,{
  status:401,headers:{'Cache-Control':'no-store'},
}));
vi.mock('../workers/cloudflare-static-preview.mjs',()=>({
  default:{fetch:genericChat},
  cloudflareEmergencyHoldEnabledV1:()=>false,
}));
const worker=(await import('../cloudflare/myeongha-worker.mjs')).default;
const base='https://myeongha.gycha0109.workers.dev';
const thread='a8100000-0000-4000-8000-000000000001';
beforeEach(()=>genericChat.mockClear());

describe('canonical chat open/read admission',()=>{
  it('routes exact new chat open into the authenticated chat runtime, without a reveal',async()=>{
    const response=await worker.fetch(new Request(base+'/api/chat',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({characterId:'seyeon'}),
    }),{},{});
    expect(response.status).toBe(401);
    expect(genericChat).toHaveBeenCalledTimes(1);
    expect(genericChat.mock.calls[0][0].url).toBe(base+'/api/chat');
  });
  it('routes canonical owned-room read through the same security-scoped API',async()=>{
    const response=await worker.fetch(new Request(base+'/api/chat/'+thread+'?afterSequenceNo=0'),{},{});
    expect(response.status).toBe(401);
    expect(genericChat).toHaveBeenCalledTimes(1);
  });
  it('does not forward legacy markers, encoded paths or assistant turns',async()=>{
    for(const [path,method] of [
      ['/api/chat?__myeongha_chat_open=1','POST'],
      ['/api/chat/'+thread+'?__myeongha_chat_thread_id='+thread,'GET'],
      ['/api/%63hat','POST'],
      ['/api/chat/'+thread+'/turns','POST'],
      ['/api/chat/'+thread+'?afterSequenceNo=0&afterSequenceNo=0','GET'],
    ]){
      const result=await worker.fetch(new Request(base+path,{method}),{},{});
      expect(result.status).not.toBe(200);
    }
    expect(genericChat).not.toHaveBeenCalled();
  });
});
