/** Converts Saju engine research-only career output into a private, non-issuance experiment payload. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const fail=m=>{throw Error(m)};
export function convertCareerSajuResearch(s){
 if(!s||s.sourceKind!=='saju_engine_derived_research_only'||s.productionIssuance!==false||s.maySell!==false||s.domain!=='career'||!Array.isArray(s.units)||s.units.length<3||!Array.isArray(s.official?.sections)||s.official.sections.length<1||!(/^[0-9a-f]{64}$/i).test(s.officialReportHash))fail('RESEARCH_ENGINE_SOURCE_REQUIRED');
 if(s.official.reportHash!==s.officialReportHash)fail('OFFICIAL_RENDER_HASH_MISMATCH');
 const evidence=s.units.map((u,i)=>{
  if(u.category!=='career'||typeof u.id!=='string'||typeof u.claimId!=='string'||typeof u.headline!=='string'||typeof u.summary!=='string'||!Array.isArray(u.sourceRefs)||u.sourceRefs.length<1)fail('UNTRACED_CAREER_UNIT');
  return {id:'career-'+String(i+1).padStart(2,'0'),text:u.headline+' — '+u.summary,origin:u.claimId+';'+u.id+';'+u.sourceRefs.join(',')};
 });
 const source={sourceKind:'saju_engine_derived_research_only',productionIssuance:false,readingId:'research-'+s.officialReportHash.slice(0,16),state:'research_only',domain:'career',officialReportHash:s.officialReportHash,evidence,limitations:['연구용 엔진 출력이며 실제 고객에게 발급된 공식 Reading이 아닙니다.','명시된 시기 근거가 없어 연도·대운 예측을 생성하지 않습니다.','새 직업 단정·실제 경력 단정·새 명리 사실을 생성하지 않습니다.']};
 const h=createHash('sha256').update(JSON.stringify(source)).digest('hex');
 return {source,manifest:{caseId:s.caseId,sourceType:'saju_engine_derived_research_only',productionIssuance:false,originalReportHash:s.officialReportHash,sourcePayloadHash:h,unitCount:evidence.length,officialSectionCount:s.official.sections.length}};
}
if(process.argv[1]?.includes('collect-yeoul-career-source.mjs')){
 const from=process.argv[2],to=process.argv[3];if(!from||!to)fail('Usage: collect-yeoul-career-source.mjs ENGINE_CASE.json PRIVATE_OUTPUT.json');
 const {source,manifest}=convertCareerSajuResearch(JSON.parse(readFileSync(resolve(from),'utf8')));
 mkdirSync(dirname(resolve(to)),{recursive:true});
 writeFileSync(resolve(to),JSON.stringify(source,null,2)+'\n',{flag:'wx',mode:0o600});
 writeFileSync(resolve(to)+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output:resolve(to),...manifest}));
}
