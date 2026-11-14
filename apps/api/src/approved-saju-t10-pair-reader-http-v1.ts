import type { SajuT10ProductionPairTrustV1 } from './saju-t10-production-pair-issue-source-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { readPostgresApprovedSajuT10PairReaderV1 } from './postgres-approved-saju-pair-reader-v1.js';
import { readBoundedUpstreamJsonTextV1 } from './upstream-json-response-resource.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const APPROVED_SAJU_PAIR_READER_PATH_V1 = '/api/approved-saju/pair/reader' as const;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const HEADERS={
  'Cache-Control':'private, no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  Vary:'Cookie, Authorization',
};
function fail(status:number,code:string) {
  return Response.json({ok:false,error:{code}},{status,headers:HEADERS});
}
export function createApprovedSajuT10PairReaderHttpV1(input: Readonly<{
  origin:string;
  pool:PostgresSubjectPoolV1;
  trusts:readonly SajuT10ProductionPairTrustV1[];
  verifyRequestIdentity:(request:Request)=>Promise<VerifiedSubjectIdentityEvidenceV1 | null>;
}>) {
  const origin=new URL(input.origin);
  if(origin.origin!==input.origin ||
      (origin.protocol!=='https:' &&
        (origin.protocol!=='http:'||origin.hostname!=='127.0.0.1')) ||
      input.trusts.length===0) throw new TypeError('Pair Reader host is not configured.');
  return Object.freeze({
    async handleRequest(request:Request):Promise<Response|null> {
      const uri=new URL(request.url);
      if(uri.pathname!==APPROVED_SAJU_PAIR_READER_PATH_V1)return null;
      if(uri.origin!==origin.origin || uri.search!=='' || uri.hash!=='')
        return fail(404,'NOT_FOUND');
      if(request.method!=='POST')return new Response(null,{
        status:405,headers:{...HEADERS,Allow:'POST'},
      });
      if(request.headers.get('Origin')!==origin.origin)return fail(403,'ACCESS_DENIED');
      if(request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')
        return fail(400,'INVALID_REQUEST');
      let selector:Record<string,unknown>;
      try {
        const raw:unknown=JSON.parse(await readBoundedUpstreamJsonTextV1(request,{
          maximumBodyBytes:1024,
          signal:AbortSignal.any([request.signal,AbortSignal.timeout(5000)]),
        }));
        if(raw===null||typeof raw!=='object'||Array.isArray(raw))return fail(400,'INVALID_REQUEST');
        selector=raw as Record<string,unknown>;
        if(Object.keys(selector).length!==3 ||
          typeof selector.purchaseIntentId!=='string' || !UUID.test(selector.purchaseIntentId) ||
          typeof selector.readingId!=='string'||!UUID.test(selector.readingId) ||
          typeof selector.readerCharacterId!=='string' ||
          !/^[a-z][a-z0-9_-]{1,63}$/u.test(selector.readerCharacterId))return fail(400,'INVALID_REQUEST');
      } catch {return fail(400,'INVALID_REQUEST');}
      try {
        const verifiedEvidence=await input.verifyRequestIdentity(request);
        if(verifiedEvidence?.kind!=='member')return fail(401,'AUTH_REQUIRED');
        const source=await readPostgresApprovedSajuT10PairReaderV1({
          pool:input.pool,verifiedEvidence,
          purchaseIntentId:selector.purchaseIntentId as string,
          readingId:selector.readingId as string,
          readerCharacterId:selector.readerCharacterId as string,
          trusts:input.trusts,
        });
        if(source===null)return fail(404,'NOT_FOUND');
        return Response.json({ok:true,data:{
          state:source.state,
          readingId:source.readingId,
          readerCharacterId:source.readerCharacterId,
          display:source.display,
          materialHash:source.materialHash,
        }},{headers:HEADERS});
      } catch{return fail(404,'NOT_FOUND');}
    },
  });
}
