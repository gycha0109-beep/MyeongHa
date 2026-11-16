/** Yeoul private development-diagnostic scenarios, never final sealed holdout.
 * Inspect local 288 historical ratings + 10 multi-turn synthetic scenario families.
 * Outputs only counts/quality axis summaries, no private prompts, replies, notes or IDs.
 */
import {readFileSync,writeFileSync,existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePrivateYeoulForResearch} from './yeoul-private-source-intake-v1.mjs';
const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const fail=s=>{throw Error('YEOUL_DIALOGUE_DIAGNOSTIC_HOLD:'+s)};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const inside=x=>{const r=relative(ROOT,x);return r===''||r==='.'||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep))};
const privateFile=(p)=>{const a=resolve(p),s=lstatSync(a);if(!s.isFile()||s.isSymbolicLink()||inside(a)||inside(realpathSync(a))||s.size>2e6)fail('private_file');return JSON.parse(readFileSync(a,'utf8'))};
const normalize=s=>s.normalize('NFKC').replace(/\s+/gu,' ').trim();
const ratingLabels=['good','awkward','fiction','harsh','flat','persona','soft','other'];
const focusLabels=['care_before_label','emotional_specificity','independent_agency','affection-not-assumed','jealousy_without_history','repair_after_pushback','directness_growth','memory-truth','tone_shift','anti_repetition'];
const stages=['no_history','first_contact','acquaintance','friend','trusted_partner'];
export function inspectYeoulDialogueDiagnostics({original,draft,knownOriginalAutoFields=false}){
 const source=preparePrivateYeoulForResearch(original,{knownOriginalAutoFields});
 if(!isObj(draft)||Object.keys(draft).sort().join('|')!==['characterAuthority','characterId','datasetRole','families','neverUseAsSealedHoldout','schemaVersion','sourceClass'].sort().join('|')
  ||draft.schemaVersion!=='yeoul-discriminative-dialogue-draft-v1'||draft.characterId!=='yeoul'
  ||draft.sourceClass!=='assistant_synthetic_unreviewed'||draft.datasetRole!=='development_diagnostic_only'
  ||draft.neverUseAsSealedHoldout!==true||draft.characterAuthority!=='DRAFT'
  ||!Array.isArray(draft.families)||draft.families.length!==10)fail('draft_contract');
 const old=new Set(source.responses.map(x=>normalize(x.input))),ids=new Set(),allTurns=new Set(),focuses=new Set(),stagesSeen=new Set();
 let totalTurns=0;
 for(const f of draft.families){
  if(!isObj(f)||Object.keys(f).sort().join('|')!==['id','relationshipStage','historyAvailable','focus','syntheticContext','userTurns','expectedSignals','regressionSignals','ownerReviewed'].sort().join('|')
   ||typeof f.id!=='string'||!/^[-a-z0-9]{5,60}$/.test(f.id)||ids.has(f.id)
   ||!stages.includes(f.relationshipStage)||typeof f.historyAvailable!=='boolean'
   ||(f.historyAvailable&&['first_contact','no_history'].includes(f.relationshipStage))
   ||!focusLabels.includes(f.focus)||focuses.has(f.focus)
   ||typeof f.syntheticContext!=='string'||f.syntheticContext.trim().length<12
   ||!Array.isArray(f.userTurns)||f.userTurns.length<2||f.userTurns.length>3
   ||!Array.isArray(f.expectedSignals)||f.expectedSignals.length<2||f.expectedSignals.length>5
   ||!Array.isArray(f.regressionSignals)||f.regressionSignals.length<2||f.regressionSignals.length>5
   ||f.ownerReviewed!==false)fail('family_contract');
  ids.add(f.id);focuses.add(f.focus);stagesSeen.add(f.relationshipStage);
  for(const v of [...f.expectedSignals,...f.regressionSignals]){
   if(typeof v!=='string'||v.trim().length<8||v.length>250)fail('signals_contract');
  }
  for(const t of f.userTurns){
   if(typeof t!=='string'||t.length>200||t.trim().length<8)fail('turn_contract');
   const n=normalize(t);
   if(old.has(n)||allTurns.has(n))fail('exposed_or_repeated_turn');
   allTurns.add(n);totalTurns++;
  }
 }
 if(focuses.size!==10||stagesSeen.size<4||totalTurns<20)fail('coverage');
 const deepseek=source.responses.filter(x=>x.model==='deepseek/deepseek-v4.1-flash-1017');
 const byQuestion=new Map(),byVariant={};
 for(const row of deepseek){
  const q=byQuestion.get(row.id)??{total:0,good:0};
  q.total++;if(row.evaluation.rating==='good')q.good++;byQuestion.set(row.id,q);
  const v=byVariant[row.variant]??{total:0,good:0};v.total++;if(row.evaluation.rating==='good')v.good++;byVariant[row.variant]=v;
 }
 if(deepseek.length!==72||byQuestion.size!==12||[...byQuestion.values()].some(x=>x.total!==6))fail('deepseek_matrix');
 const ratings=Object.fromEntries(ratingLabels.map(x=>[x,deepseek.filter(r=>r.evaluation.rating===x).length]));
 const weakest=[...byQuestion].map(([id,x])=>({id,good:x.good,total:x.total})).sort((a,b)=>a.good-b.good||a.id.localeCompare(b.id));
 return Object.freeze({
  schemaVersion:'yeoul-dialogue-diagnostic-summary-v1',
  originalResponsesChecked:source.responses.length,
  deepseekResponsesChecked:deepseek.length,
  deepseekRatings:ratings,
  byVariant,
  weakestDevelopmentQuestions:weakest.slice(0,4),
  scenarioFamilies:ids.size,scenarioTurns:totalTurns,relationshipStagesCovered:stagesSeen.size,
  uniqueFocusAxes:focuses.size,
  syntheticContextOnly:true,ownerReviewComplete:false,
  semanticIndependenceVerified:false,discriminativePowerMeasured:false,
  independentFinalHoldoutReady:false,gepaQualityGainEstablished:false,
  modelCalls:0,paidSpendKrw:0,productionEligible:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),o={};const known=args.includes('--known-original-unreviewed-auto-fields');
  const filtered=args.filter(x=>x!=='--known-original-unreviewed-auto-fields');
  if(filtered.length!==6)fail('args');
  for(let i=0;i<6;i+=2){if(!['--original','--draft','--out'].includes(filtered[i])||o[filtered[i]])fail('args');o[filtered[i]]=filtered[i+1]}
  if(!o['--original']||!o['--draft']||!o['--out'])fail('args');
  const target=resolve(o['--out']);
  if(inside(target)||inside(realpathSync(dirname(target)))||!target.endsWith('.json')||existsSync(target))fail('output_private_new');
  const report=inspectYeoulDialogueDiagnostics({
   original:privateFile(o['--original']),draft:privateFile(o['--draft']),knownOriginalAutoFields:known
  });
  writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report));
 }catch(e){console.error(e.message?.startsWith('YEOUL_DIALOGUE_DIAGNOSTIC_HOLD:')?e.message:'YEOUL_DIALOGUE_DIAGNOSTIC_HOLD:invalid_private_input');process.exitCode=1;}
}
