// Watchtower-Track: security
// First empty owner room only. A generic read Response is NEVER returned
// directly; only the verified zero-message shell is reconstructed.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function admitCloudflareSeyeonEmptyRoomV1(request, candidate, threadId) {
  if (!(candidate instanceof Response) || candidate.status !== 200 ||
      candidate.headers.has('set-cookie') || candidate.headers.has('location') ||
      candidate.headers.get('cache-control') !== 'no-store' ||
      candidate.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json' ||
      typeof threadId !== 'string' || !UUID.test(threadId)) return null;
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (request.method !== 'GET' || url.pathname !== '/api/chat/' + threadId ||
      url.hash !== '' || [...url.searchParams.keys()].some(key =>
        key !== 'afterSequenceNo' && key !== 'pageSize') ||
      url.searchParams.getAll('afterSequenceNo').length > 1 ||
      url.searchParams.getAll('pageSize').length > 1 ||
      (url.searchParams.has('afterSequenceNo') && url.searchParams.get('afterSequenceNo') !== '0')) return null;
  const sizeParam=url.searchParams.get('pageSize');
  if(sizeParam!==null && (!/^[1-9][0-9]*$/.test(sizeParam) ||
      Number(sizeParam)>50 || !Number.isSafeInteger(Number(sizeParam)))) return null;
  let envelope;
  try { envelope=await candidate.json(); } catch { return null; }
  if (!envelope || envelope.ok !== true || !envelope.data ||
      typeof envelope.data !== 'object' || Array.isArray(envelope.data)) return null;
  const data=envelope.data;
  if (data.threadId !== threadId || data.characterId !== 'seyeon' ||
      !UUID.test(data.contentReleaseId ?? '') || !UUID.test(data.contentBundleId ?? '') ||
      !Number.isSafeInteger(data.contentRevision) || data.contentRevision<0 ||
      data.afterSequenceNo!==0 || data.lastSequenceNo!==0 ||
      !Array.isArray(data.messages) || data.messages.length!==0 ||
      data.latestCharacterMessage!==null || !data.pagination ||
      data.pagination.hasMore!==false || data.pagination.nextAfterSequenceNo!==null ||
      data.pagination.pageSize!==(sizeParam===null?50:Number(sizeParam))) return null;

  // The generic controller may calculate relationship state even when
  // messages are empty. Suppress that derived data until G3 is released.
  const safe={
    threadId,characterId:'seyeon',contentReleaseId:data.contentReleaseId,
    contentBundleId:data.contentBundleId,contentRevision:data.contentRevision,
    afterSequenceNo:0,lastSequenceNo:0,messages:[],
    pagination:{pageSize:data.pagination.pageSize,hasMore:false,nextAfterSequenceNo:null},
    latestCharacterMessage:null,relationship:null,
  };
  return Response.json({ok:true,data:safe,meta:{
    apiContractVersion:'v0.9',requestId:crypto.randomUUID(),
    serverTime:new Date().toISOString(),
  }},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
