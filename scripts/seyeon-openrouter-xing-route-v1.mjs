// Public endpoint metadata only; no user or prompt access.
export const XING_FREE_MODEL_V1='xingchen-agi/xing4.0-29b-a4b:free';
const ALLOWED_TAG=/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?$/u;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function chooseXingZdrSchemaRouteV1(zdr,detail){
 if(!Array.isArray(zdr)||!obj(detail)||detail.id!==XING_FREE_MODEL_V1||
    !Array.isArray(detail.endpoints))return null;
 const matched=[];
 for(const row of zdr){
  if(!obj(row)||row.model_id!==XING_FREE_MODEL_V1||
     typeof row.tag!=='string'||!ALLOWED_TAG.test(row.tag)||
     !Array.isArray(row.supported_parameters)||!row.supported_parameters.includes('response_format'))continue;
  const ep=detail.endpoints.find(e=>obj(e)&&e.tag===row.tag&&
   Array.isArray(e.supported_parameters)&&e.supported_parameters.includes('response_format')&&
   Number(e.pricing?.prompt)===0&&Number(e.pricing?.completion)===0);
  if(!ep||Number(row.pricing?.prompt)!==0||Number(row.pricing?.completion)!==0)continue;
  if(Number.isSafeInteger(ep.status)&&ep.status!==0)continue;
  matched.push(row.tag);
 }
 return matched.length===1?matched[0]:null; // ambiguous providers are not auto-selected
}
export async function getXingZdrSchemaRouteV1(key,fetchImpl=fetch){
 const paths=['/api/v1/endpoints/zdr',
  '/api/v1/models/xingchen-agi/xing4.0-29b-a4b:free/endpoints'];
 const data=[];
 for(const path of paths){
  try{
   const r=await fetchImpl('https://openrouter.ai'+path,{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{authorization:'Bearer '+key,accept:'application/json'}});
   if(r.status!==200||!/^application\/json(?:;|$)/iu.test(r.headers.get('content-type')??''))return null;
   if(Number(r.headers.get('content-length')??0)>4000000)return null;
   const txt=await r.text();
   if(Buffer.byteLength(txt,'utf8')>4000000)return null;
   const v=JSON.parse(txt);
   if(!obj(v))return null;
   data.push(v.data);
  }catch{return null;}
 }
 return chooseXingZdrSchemaRouteV1(data[0],data[1]);
}
