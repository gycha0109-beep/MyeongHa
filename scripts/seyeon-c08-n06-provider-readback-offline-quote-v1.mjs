/**
 * C08 §7.3 #5-6: offline ONLY exact-route quote from a sanitized GET report.
 * Input wire-byte snapshots were recorded by the real adapter + mock fetch in
 * PR #2525 CI 39982013033, NOT inferred from advertised model prices.
 * Exact model AND provider.only tag must match, because tag bytes alter wire.
 * No model POST, network, credential, billing authority or live dispatch.
 */
import {readFileSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {
  SEYEON_C08_N06_EXACT_TEXT_V1,
  planSeyeonC08N06PairedOfflineV1,
} from './seyeon-c08-n06-paired-paid-research-plan-offline-v1.mjs';

export const SEYEON_C08_N06_WIRE_CAPTURE_V1=Object.freeze({
  model:'openai/gpt-oss-120b',
  providerTag:'openai',
  baselineRequestBytes:Object.freeze([5414,18683,14465]),
  compactRequestBytes:Object.freeze([5414,14030,12726]),
  stageCompletionCaps:Object.freeze([1536,1536,1536]),
  provenance:'PR_2525_CI_39982013033_ADAPTER_MOCK_FETCH',
  inferenceCallsInCapture:0,
  modelTokenizerVerified:false,
});
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const deny=reason=>Object.freeze({
  disposition:reason,
  permittedPaidCalls:0,
  metadataProvesProviderHardCap:false,
  requestZdrRuntimeVerified:false,
  strictJsonRuntimeVerified:false,
  invoiceReconciled:false,
  paidDispatchAuthorized:false,
  productionPromotionAuthorized:false,
});
/**
 * Never chooses a provider from an advertised model page; permits exactly
 * one pre-captured wire route. Nonmatching tags and models need new captures.
 */
export function quoteSeyeonC08N06FromReadbackOfflineV1({
  readback,
  capture=SEYEON_C08_N06_WIRE_CAPTURE_V1,
}={}){
  if(!object(readback)||readback.schema!=='seyeon-c08-provider-metadata-once-v1'||
     readback.completeMetadataRead!==true||readback.metadataGetCount!==4||
     readback.inferencePostCount!==0||readback.zdrStatus!==200||
     !/^[a-f0-9]{40}$/u.test(readback.commitSha??'')||
     !Array.isArray(readback.models)||readback.models.length!==3||
     !Array.isArray(readback.modelStatuses)||readback.modelStatuses.length!==3||
     !readback.modelStatuses.every(s=>object(s)&&s.status===200)){
    return deny('INCOMPLETE_OR_UNVERIFIED_PROVIDER_READBACK_HOLD');
  }
  // Refuse forged/nonstandard capture shape and new models/tags, rather than
  // silently reuse stale byte lengths on a different serialized request.
  const fixed=SEYEON_C08_N06_WIRE_CAPTURE_V1;
  if(!object(capture)||capture.model!==fixed.model||
     capture.providerTag!==fixed.providerTag||
     capture.provenance!==fixed.provenance||
     !Array.isArray(capture.stageCompletionCaps)||
     !Array.isArray(capture.baselineRequestBytes)||
     !Array.isArray(capture.compactRequestBytes)||
     ![capture.stageCompletionCaps,capture.baselineRequestBytes,
       capture.compactRequestBytes].every((xs,i)=>
       xs.length===3&&xs.every((n,j)=>
         n===[fixed.stageCompletionCaps,fixed.baselineRequestBytes,
           fixed.compactRequestBytes][i][j]))){
    return deny('WIRE_CAPTURE_DRIFT_OR_UNKNOWN_PROVIDER_HOLD');
  }
  const model=readback.models.filter(x=>object(x)&&x.model===fixed.model);
  const seen=readback.modelStatuses.filter(x=>x.model===fixed.model);
  if(model.length!==1||seen.length!==1||
     !Array.isArray(model[0].providers)){
    return deny('EXACT_MODEL_METADATA_MISSING_HOLD');
  }
  const provider=model[0].providers.filter(x=>object(x)&&
    x.providerTag===fixed.providerTag);
  if(provider.length!==1||
     model[0].providers.filter(x=>x?.providerTag===fixed.providerTag).length!==1){
    return deny('EXACT_PROVIDER_TAG_NOT_PRESENT_HOLD');
  }
  let scenario;
  try{
    scenario=planSeyeonC08N06PairedOfflineV1({
      text:SEYEON_C08_N06_EXACT_TEXT_V1,
      model:fixed.model,providerTag:fixed.providerTag,readback,
      baselineRequestBytes:fixed.baselineRequestBytes,
      compactRequestBytes:fixed.compactRequestBytes,
      stageCompletionCaps:fixed.stageCompletionCaps,
    });
  }catch{
    return deny('MALFORMED_OR_OVERPRICE_PROVIDER_HOLD');
  }
  const withinCaps=scenario.tenKrwPerTurnUnderMetadataScenario===true&&
    scenario.twentyKrwTwoTurnEnvelopeUnderMetadataScenario===true;
  return Object.freeze({
    disposition:withinCaps?'MATH_SCENARIO_UNDER_BUDGET_NOT_AUTHORIZED':
      'TEN_KRW_PER_TURN_STRESS_OVER_BUDGET_HOLD',
    model:fixed.model,providerTag:fixed.providerTag,
    wireSource:fixed.provenance,
    baselineRequestBytes:[...fixed.baselineRequestBytes],
    compactRequestBytes:[...fixed.compactRequestBytes],
    reservedMicroUsdPerArm:scenario.arms.map(a=>a.reservedMicroUsd),
    reservedKrwPerArm:scenario.arms.map(a=>a.reservedKrw),
    totalReservedMicroUsd:scenario.totalReservedMicroUsd,
    totalReservedKrw:scenario.totalReservedKrw,
    scenarioOnlyUnderAdvertisedEndpointMetadata:true,
    exactRouteBytesCapturedWithMockProvider:true,
    actualProviderResponseObserved:false,
    ...deny('NO_AUTHORIZATION_FROM_PRICE_OR_METADATA'),
  });
}

/** Local CLI consumes a manually downloaded sanitized GitHub artifact. */
function main(){
  try{
    if(process.argv.length!==3)throw Error('bad args');
    const filename=process.argv[2];
    const stat=statSync(filename);
    if(!stat.isFile()||stat.size<2||stat.size>65536)
      throw Error('bad file');
    const report=JSON.parse(readFileSync(filename,'utf8'));
    const result=quoteSeyeonC08N06FromReadbackOfflineV1({readback:report});
    console.log('SEYEON_C08_N06_PROVIDER_REPLAY '+JSON.stringify(result));
    if(result.disposition!=='MATH_SCENARIO_UNDER_BUDGET_NOT_AUTHORIZED')
      process.exitCode=1;
  }catch{
    console.error('SEYEON_C08_N06_PROVIDER_REPLAY_HOLD');
    process.exitCode=1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
