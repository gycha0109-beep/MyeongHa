// Watchtower-Track: security
// D-04 is NOT approved: this proves current Production HOLD at the real HTTP
// handler after Vercel canonicalization; no positive authorization is added.
import { describe, expect, it } from 'vitest';
import {
  resolveMeDispatchTargetForTestV1,
  toCanonicalMeRequestForTestV1,
} from '../api/me.js';
import {
  handleSeyeonChatTurnSendRequestV1,
} from '../apps/api/src/chat-turn-send-http.js';

const THREAD='d4000000-0000-4000-8000-000000000078';
const CLIENT_TURN='423e4567-e89b-42d3-a456-426614174078';
const CANARY='D04_ORIGINAL_GRANT_REVOKED_PRIVATE_ASSISTANT_CANARY';

function sourceRequest(url:string,body:BodyInit|null=JSON.stringify({
  clientTurnId:CLIENT_TURN,text:'합성 대화',
})):Request {
  return new Request(url,{
    method:'POST',
    headers:{
      authorization:'Bearer synthetic-member',
      'content-type':'application/json',
      'x-seyeon-reveal-authorized':'true',
      'x-original-grant-id':'synthetic-untrusted-client-value',
    },
    body,
    ...(body instanceof ReadableStream?{duplex:'half' as const}:{}),
  } as RequestInit & {duplex?:'half'});
}

function member(){
  return {verifyRequestIdentity:async()=>Object.freeze({
    kind:'member' as const,verifiedAuthUserId:'synthetic-member',
  })};
}
function capturedRuntime(counter:{calls:number}) {
  return {run:async()=>{
    counter.calls+=1;
    // Either executed or replayed data arriving here would be sensitive.
    return {execution:{disposition:'committed_replay',assistantText:CANARY}} as never;
  }};
}
async function assertHeld(request:Request,counter:{calls:number}){
  const result=await handleSeyeonChatTurnSendRequestV1({
    request,requestId:'d04-exact-transport-negative',
    serverTime:'2026-10-18T00:00:00.000Z',
    identityEvidenceVerifier:member(),
    runtime:capturedRuntime(counter),
  });
  const wire=await result.text();
  expect(result.status).toBe(503);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.headers.get('content-type')).toContain('application/json');
  expect(result.headers.get('content-type')).not.toContain('text/event-stream');
  expect(JSON.parse(wire)).toMatchObject({
    ok:false,
    error:{
      code:'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE',
      messageKey:'chat.secure_reveal_unavailable',
      retryable:false,
    },
  });
  expect(counter.calls).toBe(0);
  expect(wire).not.toContain(CANARY);
  expect(wire).not.toContain(THREAD);
  expect(wire).not.toContain(CLIENT_TURN);
}
describe('D-04 candidate: real HTTP ingress routes remain HOLD before Response bytes',()=>{
  it.each([
    'https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD,
    'https://myeongha.vercel.app/api/chat/'+THREAD+'/turns?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD,
  ])('canonical Vercel source %s cannot bypass first Reveal even with forged permission headers',async url=>{
    const source=sourceRequest(url);
    const target=resolveMeDispatchTargetForTestV1(source);
    expect(target).toMatchObject({
      kind:'chat-turn-send',threadId:THREAD,
    });
    const canonical=toCanonicalMeRequestForTestV1(source,target??undefined);
    expect(new URL(canonical.url).search).toBe('');
    const calls={calls:0};
    await assertHeld(canonical,calls);
  });

  it('a delayed streamed request body cannot sneak a paid runtime or assistant bytes past HOLD',async()=>{
    let completeBody!:()=>void;
    const bodyGate=new Promise<void>(resolve=>{completeBody=resolve;});
    const utf8=new TextEncoder();
    const body=new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(utf8.encode('{"clientTurnId":"'+CLIENT_TURN+'","text":"'));
        void bodyGate.then(()=>{
          controller.enqueue(utf8.encode('합성 대화"}'));
          controller.close();
        });
      },
    });
    const source=sourceRequest(
      'https://myeongha.vercel.app/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD,
      body,
    );
    const target=resolveMeDispatchTargetForTestV1(source);
    expect(target?.kind).toBe('chat-turn-send');
    const canonical=toCanonicalMeRequestForTestV1(source,target??undefined);
    const calls={calls:0};
    const pending=assertHeld(canonical,calls);
    expect(calls.calls).toBe(0);
    completeBody();
    await pending;
    expect(calls.calls).toBe(0);
  });

  it.each([
    '?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD+'&afterSequenceNo=1',
    '?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD+'&__myeongha_chat_open=1',
    '?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD+'&__myeongha_chat_turn_send=1',
    '?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id='+THREAD+'&threadId='+THREAD,
  ])('mixed/repeated rewrite authority is rejected instead of silently stripped: %s',query=>{
    const source=sourceRequest('https://myeongha.vercel.app/api/me'+query);
    expect(resolveMeDispatchTargetForTestV1(source)).toBeNull();
  });

  it('materializing a Response before revoke does not make its bytes revocable later',async()=>{
    // Deliberate counterexample, NOT a Production response or a G3 permit.
    const constructed=Response.json({assistantText:CANARY});
    let originalGrantActive=true;
    originalGrantActive=false; // the hypothetical original Grant is revoked
    expect(originalGrantActive).toBe(false);
    const bytes=await constructed.text();
    expect(bytes).toContain(CANARY);
    // Therefore a prior DB read COMMIT or Response construction cannot prove
    // that no bytes will be delivered after a revoke acknowledgment.
  });
});
