import {randomUUID} from 'node:crypto';
import {executeSecurityObservedRequestV1} from '../../apps/api/src/security-observability.js';
import {createProductionChatCreditWalletRuntimeV1} from '../../apps/api/src/production-chat-credit-wallet-runtime-v1.js';

const PATH='/api/me/credits';
const NO_STORE='no-store';
let runtime:ReturnType<typeof createProductionChatCreditWalletRuntimeV1>|undefined;

export const CHAT_CREDIT_WALLET_ROUTE_V1=Object.freeze({
  path:PATH,
  method:'GET',
  paidCheckoutEnabled:false,
  chatDebitsEnabled:false,
} as const);

function canonicalRequest(request:Request):Request|null {
  let url:URL;
  try{url=new URL(request.url);}catch{return null;}
  if(url.pathname!==PATH || url.hash!=='')return null;
  const keys=[...new Set(url.searchParams.keys())];
  if(keys.some(x=>x!=='_vercel_share'))return null;
  const values=url.searchParams.getAll('_vercel_share');
  if(values.length>1 || (values.length===1 && !values[0]))return null;
  return new Request('https://myeongha.internal'+PATH,{
    method:request.method,headers:request.headers,
  });
}
function withNoStore(response:Response):Response {
  const headers=new Headers(response.headers);
  headers.set('Cache-Control',NO_STORE);
  return new Response(response.body,{status:response.status,headers});
}

export default {
  fetch(request:Request):Promise<Response> {
    return executeSecurityObservedRequestV1({
      request,
      routeId: 'api.me.credits',requestIdFactory:randomUUID,
      execute:async ({requestId})=>{
        const safe=canonicalRequest(request);
        if(safe===null)return new Response(null,{status:404,headers:{'Cache-Control':NO_STORE}});
        runtime??=createProductionChatCreditWalletRuntimeV1({env:process.env});
        return withNoStore(await runtime.handleRequest({
          request:safe,requestId,serverTime:new Date().toISOString(),
        }));
      },
    });
  },
};
