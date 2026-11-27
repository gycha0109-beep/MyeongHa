/** 10000 synthetic signed Source requests; no DB/payment/AI/production. */
import {generateKeyPairSync,randomUUID,verify} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const load=p=>import(pathToFileURL(resolve('.cross-service/saju',p)).href);
const {deterministicContentHash:hash}=await load('dist/interpretation/rule-registry.js');
const {createMyeonghwaProductionCalculationProcessV1}=await load('dist/production-calculation-process.js');
const {PRODUCTION_RELATIONSHIP_AUTHORITY_HASH}=await load('dist/production/production-relationship-official-reading-issuer.js');
const {T10_PRODUCTION_PAIR_ISSUE_DOMAIN_V1,T10_PRODUCTION_PAIR_ISSUE_PATH_V1,T10_PRODUCTION_PAIR_ISSUE_PROOF_HEADER_V1}=await load('dist/host/t10-production-pair-issue-proof.js');
const t8=generateKeyPairSync('ed25519'),t10=generateKeyPairSync('ed25519');
const offers=['first-counterpart','additional-counterpart','relationship-plus-first'];
const bearer='isolated-10000-requests';
const key=x=>x.export({format:'der',type:'pkcs8'}).toString('base64');
const {server}=createMyeonghwaProductionCalculationProcessV1({
 SAJU_PRODUCTION_HOST:'127.0.0.1',SAJU_PRODUCTION_SERVICE_BEARER:bearer,
 SAJU_T8_PRODUCTION_RELATIONSHIP_ISSUER_CONFIG:JSON.stringify({issuer:'saju',audience:'myeongha',keyId:'test-t8',engineVersion:'test-engine',releaseRef:'isolated-t8-10000',privateKeyPkcs8Base64:key(t8.privateKey)}),
 SAJU_T10_PRODUCTION_PAIR_ISSUER_CONFIG:JSON.stringify({issuer:'saju',audience:'myeongha',keyId:'test-t10',engineVersion:'test-engine',privateKeyPkcs8Base64:key(t10.privateKey),releaseByOffer:Object.fromEntries(offers.map(o=>[o,'isolated-t10-10000']))}),
});
const birth=i=>({calendarType:'solar',date:[1980+i%30,1+Math.floor(i/30)%12,1+Math.floor(i/360)%28].map((x,k)=>String(x).padStart(k?2:4,'0')).join('-'),time:String(i%24).padStart(2,'0')+':'+String(i%60).padStart(2,'0'),sex:'unspecified'});
const unique=new Set(),proofs=new Set();let ok8=0,ok10=0,failed=0;
const examples=[];const started=Date.now();
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
const url='http://127.0.0.1:'+server.address().port;
const post=async(path,body,headers={})=>{
 const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+bearer,...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const json=await r.json().catch(()=>null);
 if(r.status!==200)throw Error('HTTP '+r.status+' '+JSON.stringify(json).slice(0,200));
 return {r,json};
};
function signature(result,kind,key,expected){
 const v=result.r.headers.get(kind==='t8'?'x-myeonghwa-production-issue-proof':T10_PRODUCTION_PAIR_ISSUE_PROOF_HEADER_V1);
 if(!v)throw Error('missing Ed25519 proof');
 const proof=JSON.parse(Buffer.from(v,'base64url').toString('utf8'));
 for(const [k,val] of Object.entries(expected))if(proof.payload[k]!==val)throw Error('proof mismatch '+k);
 const prefix=kind==='t8'?'myeongha/saju/production-reading-issue/v1\0':T10_PRODUCTION_PAIR_ISSUE_DOMAIN_V1;
 if(!verify(null,Buffer.from(prefix+hash(proof.payload)),key,Buffer.from(proof.signature,'base64url')))throw Error('signature invalid');
 if(proofs.has(proof.signature))throw Error('duplicate signature');
 proofs.add(proof.signature);
}
try{
 for(let i=0;i<10000;i++){
  const mine=birth(i),id=JSON.stringify(mine),attempt=randomUUID();
  if(unique.has(id))throw Error('duplicate synthetic birth fixture '+i);
  unique.add(id);
  try{
   if(i<5000){
    const request={birth:mine,reading:{text:'연애운'}};
    const r=await post('/api/readings',request,{'x-myeongha-reading-execution-attempt-id':attempt,'x-myeongha-reading-release':'isolated-t8-10000','x-myeongha-reader-source':'canonical-v1'});
    if(r.json?.state!=='delivered'||!r.json?.readerSource?.semanticSource?.units?.some(x=>x.role==='primary'&&/[가-힣]/u.test(x.canonicalText?.summary??'')))throw Error('T8 Korean Reader missing');
    const {readerSource,...reading}=r.json;
    signature(r,'t8',t8.publicKey,{authorityHash:PRODUCTION_RELATIONSHIP_AUTHORITY_HASH,executionAttemptId:attempt,requestBodyHash:hash(request),responseBodyHash:hash(reading),readerSourceHash:hash(readerSource),releaseRef:'isolated-t8-10000'});
    ok8++;
   }else{
    const offerId=offers[i%3],partnerBirth=birth((i+1237)%10000),request={birth:mine,partnerBirth};
    const binding={executionAttemptId:attempt,readingId:randomUUID(),purchaseIntentId:randomUUID(),offerId,counterpartOrder:offerId==='additional-counterpart'?'additional':'first',targetPersonId:randomUUID(),useApprovalRef:'synthetic-consent',admissionHash:'synthetic-admission',birthRevisionId:randomUUID(),targetBirthRevisionId:randomUUID(),sourceBirthInputHash:'sha256:v1:'+'a'.repeat(64),targetBirthInputHash:'sha256:v1:'+'b'.repeat(64),sourceRequestHash:hash(request),releaseRef:'isolated-t10-10000'};
    const r=await post(T10_PRODUCTION_PAIR_ISSUE_PATH_V1,{...request,binding});
    if(r.json?.state!=='issued'||r.json?.readingId!==binding.readingId||r.json?.charts?.[0]?.birthRevisionId!==binding.birthRevisionId||r.json?.charts?.[1]?.birthRevisionId!==binding.targetBirthRevisionId||!r.json?.units?.some(x=>/[가-힣]/u.test(x.paragraph)))throw Error('T10 signed Korean charts missing');
    signature(r,'t10',t10.publicKey,{executionAttemptId:attempt,purchaseIntentId:binding.purchaseIntentId,readingId:binding.readingId,offerId,targetPersonId:binding.targetPersonId,releaseRef:'isolated-t10-10000',responseBodyHash:hash(r.json)});
    ok10++;
   }
  }catch(e){failed++;if(examples.length<10)examples.push({index:i,reason:String(e.message??e)})}
  if((i+1)%500===0)console.log('PROGRESS',i+1,'/10000 verified',ok8+ok10,'failed',failed);
 }
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
const result={total:10000,passed:ok8+ok10,failed,t8:ok8,t10:ok10,uniqueBirthInputs:unique.size,uniqueSignatures:proofs.size,elapsedSeconds:Math.round((Date.now()-started)/1000),examples};
console.log('TEN_THOUSAND_SIGNED_SOURCE_RESULT '+JSON.stringify(result));
if(result.passed!==10000||result.uniqueBirthInputs!==10000||result.uniqueSignatures!==10000)process.exitCode=1;
