import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
function equal(a, b) { if(typeof a!=='string'||typeof b!=='string')return false; const x=Buffer.from(a),y=Buffer.from('Bearer '+b);return x.length===y.length&&timingSafeEqual(x,y); }
function birth(v) {
  if(!v||!['solar','lunar'].includes(v.calendarType)||!/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate||'')||typeof v.timeKnown!=='boolean'||typeof v.isLeapMonth!=='boolean'||!['male','female','unspecified',null].includes(v.sex??null))throw Error('birth');
  const [year,month,day]=v.birthDate.split('-').map(Number);
  if(year<1800||year>2300||month<1||month>12||day<1||day>31)throw Error('date');
  let time={known:false};
  if(v.timeKnown){const m=/^(\d{2}):(\d{2})(?::00)?$/.exec(v.birthTime??'');if(!m||+m[1]>23||+m[2]>59)throw Error('time');time={known:true,hour:+m[1],minute:+m[2]};}
  return {calendarType:v.calendarType,date:{year,month,day},time,isLeapMonth:v.isLeapMonth,...(v.sex&&v.sex!=='unspecified'?{sexForTraditionalCalculation:v.sex}:{})};
}
function reply(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
function currentPeriod(){const x=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return {targetYear:+x.year,targetMonth:+x.month,referenceDateTime:new Date().toISOString()};}
export async function startLocalSajuResearchService({sajuPath,bearer,port=15435}){
  const [temporal,pair]=await Promise.all(['annual-monthly-birth-research-runtime','compatibility-two-birth-research-runtime'].map(n=>import(pathToFileURL(resolve(sajuPath,'dist/preview/'+n+'.js')).href)));
  const server=createServer(async(req,res)=>{
    if(req.url!=='/internal/research'||req.method!=='POST'||!equal(req.headers.authorization,bearer))return reply(res,404,{ok:false});
    if(+(req.headers['content-length']??0)>2048)return reply(res,413,{ok:false});
    try{
      let raw='';for await(const c of req){raw+=c.toString();if(raw.length>2048)throw Error('size');}
      const v=JSON.parse(raw),subject=birth(v.subjectBirth);
      if(v.kind==='annual_monthly'&&Object.keys(v).length===2){
        const r=temporal.buildAnnualMonthlyBirthResearchReading(subject,{requestId:randomUUID(),...currentPeriod()});
        if(r.lifecycle!=='internal_research_only'||r.mayPublish!==false||r.maySell!==false)throw Error('authority');
        return reply(res,200,{ok:true,lifecycle:'internal_research_only',year:r.report.targetYear,month:r.report.targetMonth,annual:{label:r.report.annual.headline,sections:r.report.annual.sections.map(x=>({title:x.title,text:x.text}))},monthly:{label:r.monthlyMenu.label,status:r.monthlyMenu.statusMessage,sections:r.monthlyMenu.sections.map(x=>({title:x.title,text:x.text}))}});
      }
      if(v.kind==='compatibility'&&v.consent===true&&Object.keys(v).length===4){
        const r=pair.buildCompatibilityTwoBirthResearchReading(subject,birth(v.targetBirth),{requestId:randomUUID(),subjectPersonRef:'local-owner',targetPersonRef:'consented-other',referenceDateTime:new Date().toISOString()});
        if(r.lifecycle!=='internal_research_only'||r.maySell!==false||r.mayPublish!==false||r.mayClaimInterpersonalMeaning!==false)throw Error('authority');
        return reply(res,200,{ok:true,lifecycle:'internal_research_only',status:'two_person_calculation_only',subject:r.report.subject.pillars,counterpart:r.report.target.pillars});
      }
      reply(res,400,{ok:false});
    }catch{reply(res,422,{ok:false,error:'RESEARCH_INPUT_OR_SOURCE_UNAVAILABLE'});}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok)});return server;
}
