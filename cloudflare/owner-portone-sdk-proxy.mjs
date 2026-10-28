// Watchtower-Track: commerce-payment
// A fixed, read-only first-party relay for the official PortOne V2
// browser SDK on the Owner Admin sandbox test page only.
// Never relay arbitrary URLs, headers, cookies, tokens or payment responses.
export const OWNER_PORTONE_SDK_PATH='/owner-portone-sdk-v2.js';
export const PORTONE_V2_SDK_ORIGIN='https://cdn.portone.io/v2/browser-sdk.js';

const SDK_RESPONSE_HEADERS=Object.freeze({
 'Content-Type':'application/javascript; charset=utf-8',
 'Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
 'Cross-Origin-Resource-Policy':'same-origin',
});

export function isOwnerPortOneSdkRequestV1(request,url=new URL(request.url)){
 return request.method==='GET' &&
   url.pathname===OWNER_PORTONE_SDK_PATH && url.search==='';
}

function unavailable(reason,status){
 return new Response('Sandbox SDK unavailable',{
  status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
   'X-Myeongha-Sdk-Failure':reason,
   ...(Number.isInteger(status)&&status>=100&&status<=599
    ?{'X-Myeongha-Sdk-Upstream-Status':String(status)}:{}),
  },
 });
}

export async function serveOwnerPortOneSdkV1(fetchSdk=fetch){
 try{
  const upstream=await fetchSdk(PORTONE_V2_SDK_ORIGIN,{
   method:'GET',redirect:'error',
   headers:{Accept:'application/javascript, text/javascript;q=0.9'},
  });
  const type=upstream.headers.get('Content-Type')??'';
  // Never render a CDN error page or challenge as executable JavaScript.
  if(upstream.status!==200)return unavailable('upstream-status',upstream.status);
  if(!/^(?:application|text)\/(?:javascript|ecmascript)(?:\s*;|\s*$)/iu.test(type))
   return unavailable('upstream-content-type',upstream.status);
  if(!upstream.body)return unavailable('upstream-empty',upstream.status);
  return new Response(upstream.body,{status:200,headers:SDK_RESPONSE_HEADERS});
 }catch{
  return unavailable('upstream-unavailable');
 }
}
