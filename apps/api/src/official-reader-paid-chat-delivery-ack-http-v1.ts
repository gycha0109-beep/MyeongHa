import type {
  IdentityEvidenceVerificationPortV1,
} from './current-subject-profile-http.js';
import {
  OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
  acknowledgeOfficialReaderPrivateDeliveryV1,
} from './official-reader-private-delivery-journal-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

/**
 * S7 client acknowledgment endpoint: no answer text and no grant mutation.
 * This handler is NOT registered with the production web adapter while
 * protected Reader disclosure remains OFF. Creation of an HTTP Response
 * from the S6 GET is not considered a client acknowledgment.
 */
export const OFFICIAL_READER_PAID_DELIVERY_ACK_HTTP_V1 = Object.freeze({
  method:'POST',
  route:'/api/chat/:threadId/paid-readings/:safeMessageId/ack',
  schemaVersion:OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
} as const);

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN=/^[A-Za-z0-9_-]{43}$/u;
const ROUTE=/^\/api\/chat\/([^/]+)\/paid-readings\/([^/]+)\/ack$/u;
const MAX_BODY_BYTES=2048;
const NO_STORE=Object.freeze({
  'Cache-Control':'private, no-store, max-age=0',
  Pragma:'no-cache',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  Vary:'Cookie, Authorization',
} as const);

interface AckPayload {
  readonly schemaVersion:typeof OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1;
  readonly deliveryAttemptId:string;
  readonly deliveryRequestId:string;
  readonly acknowledgementToken:string;
}

function failed(status:number,code:string,requestId:string):Response {
  return Response.json({
    ok:false,
    error:{code,messageKey:'reader.paid_unavailable',retryable:false},
    meta:{apiContractVersion:'v0.9',requestId},
  },{status,headers:NO_STORE});
}
function parseRoute(request:Request):Readonly<{
  threadId:string; safeMessageId:string;
}>|null {
  const url=new URL(request.url);
  if(url.hash!=='' || [...url.searchParams.keys()].length!==0) return null;
  const match=ROUTE.exec(url.pathname);
  if(!match || !UUID.test(match[1] ?? '') || !UUID.test(match[2] ?? '')) {
    return null;
  }
  return Object.freeze({
    threadId:match[1]!.toLowerCase(),
    safeMessageId:match[2]!.toLowerCase(),
  });
}

async function readBoundedJson(request:Request):Promise<AckPayload|null> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
      || !request.body) return null;
  const contentLength=request.headers.get('Content-Length');
  if (contentLength !== null && (!/^\d+$/u.test(contentLength)
      || Number(contentLength)>MAX_BODY_BYTES)) return null;
  let reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  const chunks:Uint8Array[]=[];
  let length=0;
  try {
    // getReader() can throw for a locked or interrupted body BEFORE read().
    // No malformed S7 ACK may escape the governed 400 response boundary.
    reader=request.body.getReader();
    for (;;) {
      const next=await reader.read();
      if (typeof next?.done!=='boolean') return null;
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      length+=next.value.byteLength;
      if(!Number.isSafeInteger(length) || length>MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* preserve the rejection */ }
        return null;
      }
      chunks.push(next.value);
    }
    if(length===0) return null;
    const bytes=new Uint8Array(length);
    let offset=0;
    for(const chunk of chunks) {
      bytes.set(chunk,offset);
      offset+=chunk.byteLength;
    }
    const value:unknown=JSON.parse(
      new TextDecoder('utf-8',{fatal:true}).decode(bytes),
    );
    if(value===null || typeof value!=='object' || Array.isArray(value)) return null;
    const record=value as Record<string,unknown>;
    const keys=[
      'schemaVersion','deliveryAttemptId',
      'deliveryRequestId','acknowledgementToken',
    ];
    if(Object.keys(record).length!==keys.length
        || keys.some(key=>!Object.hasOwn(record,key))
        || record.schemaVersion!==OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1
        || typeof record.deliveryAttemptId!=='string'
        || !UUID.test(record.deliveryAttemptId)
        || typeof record.deliveryRequestId!=='string'
        || !UUID.test(record.deliveryRequestId)
        || typeof record.acknowledgementToken!=='string'
        || !TOKEN.test(record.acknowledgementToken)) return null;
    return Object.freeze({
      schemaVersion:OFFICIAL_READER_PRIVATE_DELIVERY_VERSION_V1,
      deliveryAttemptId:record.deliveryAttemptId.toLowerCase(),
      deliveryRequestId:record.deliveryRequestId.toLowerCase(),
      acknowledgementToken:record.acknowledgementToken,
    });
  } catch {
    return null;
  } finally {
    try { reader?.releaseLock(); } catch { /* cleanup is not ACK authority */ }
  }
}

export interface HandleOfficialReaderPaidDeliveryAckHttpInputV1 {
  readonly request:Request;
  readonly requestId:string;
  readonly serverTime:string;
  readonly paidReadReleaseEnabled?:boolean;
  readonly identityEvidenceVerifier?:IdentityEvidenceVerificationPortV1;
  readonly pool?:PostgresSubjectPoolV1;
}

export async function handleOfficialReaderPaidDeliveryAckHttpV1(
  input:HandleOfficialReaderPaidDeliveryAckHttpInputV1,
):Promise<Response> {
  const route=parseRoute(input.request);
  if (!route) return failed(404,'NOT_FOUND',input.requestId);
  if(input.request.method!=='POST') {
    return new Response(null,{
      status:405,
      headers:{...NO_STORE,Allow:'POST'},
    });
  }
  if(input.paidReadReleaseEnabled!==true
      || !input.identityEvidenceVerifier || !input.pool) {
    return failed(503,'CAPABILITY_UNAVAILABLE',input.requestId);
  }

  // Web: exact same-origin + non-simple custom header prevents cross-site
  // cookie-authenticated writes. Native apps do not reliably send Origin;
  // permit the native shape ONLY with a JWT-shaped explicit Bearer and NO
  // ambient Cookie. A foreign non-null Origin is always rejected. No CORS
  // response is emitted, and Subject identity is verified below.
  const expectedOrigin=new URL(input.request.url).origin;
  const origin=input.request.headers.get('Origin');
  const bearer=input.request.headers.get('Authorization');
  const nativeBearerOnly=origin===null
    && input.request.headers.get('Cookie')===null
    && typeof bearer==='string'
    && /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(bearer);
  if((origin!==expectedOrigin && !nativeBearerOnly)
      || input.request.headers.get('X-Reader-Delivery-Ack')!=='1') {
    return failed(403,'ACCESS_DENIED',input.requestId);
  }

  const payload=await readBoundedJson(input.request);
  if(payload===null) return failed(400,'INVALID_REQUEST',input.requestId);

  try {
    const evidence=await input.identityEvidenceVerifier.verifyRequestIdentity(
      input.request,
    );
    if(!evidence) return failed(401,'AUTH_REQUIRED',input.requestId);
    if(evidence.kind!=='member') return failed(403,'ACCESS_DENIED',input.requestId);

    const result=await acknowledgeOfficialReaderPrivateDeliveryV1({
      pool:input.pool,
      verifiedEvidence:evidence,
      threadId:route.threadId,
      safeMessageId:route.safeMessageId,
      deliveryAttemptId:payload.deliveryAttemptId,
      deliveryRequestId:payload.deliveryRequestId,
      acknowledgementToken:payload.acknowledgementToken,
    });

    return Response.json({
      ok:true,
      data:{
        schemaVersion:result.contractVersion,
        deliveryAttemptId:result.deliveryAttemptId,
        clientAcknowledgedAt:result.clientAcknowledgedAt,
        replayed:result.replayed,
      },
      meta:{
        apiContractVersion:'v0.9',
        requestId:input.requestId,
        serverTime:input.serverTime,
      },
    },{headers:NO_STORE});
  } catch {
    // Do not reveal whether Subject/Reader, purchase, ciphertext,
    // Prepared receipt or an expired token ever existed.
    return failed(404,'NOT_FOUND',input.requestId);
  }
}
