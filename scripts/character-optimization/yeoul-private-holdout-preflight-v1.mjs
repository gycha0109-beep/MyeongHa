/** Offline intake of newly authored private holdout *drafts*.
 * No GEPA import, paid model transport, reviewer approval, or disclosure of private turns.
 * This inspects a local file only; it cannot establish semantic independence or source authenticity.
 */
import { readFileSync } from 'node:fs';
import { lstat, realpath, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEOUL_NEW_FAMILY_DRAFTS } from './yeoul-new-scenario-families-v1.mjs';
import { preparePrivateYeoulForResearch } from './yeoul-private-source-intake-v1.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PUBLIC_H = JSON.parse(readFileSync(new URL('../../docs/character-runtime-lab/yeoul-holdout-scenarios-v1.json', import.meta.url), 'utf8'));
const FAILURE = 'YEOUL_PRIVATE_HOLDOUT_PREFLIGHT_INVALID:';
const fail = code => { throw new Error(FAILURE+code); };
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => isObj(x) && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const within = (dir, path) => path === dir || path.startsWith(dir + sep);
const normalized = text => text.normalize('NFKC').toLocaleLowerCase('ko-KR')
  .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]/gu, '').trim();
const grams = text => new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2)));
const similarity = (a,b) => {
  if(a===b || a.includes(b) || b.includes(a)) return 1;
  const x=grams(a),y=grams(b);
  if(!x.size || !y.size) return 0;
  let n=0;for(const v of x)if(y.has(v))n++;
  return n/(x.size+y.size-n);
};
const EXPOSED = Object.freeze([
  ...YEOUL_NEW_FAMILY_DRAFTS.flatMap(f=>f.turns),
  ...PUBLIC_H.scenarios.flatMap(f=>[...f.turns, ...(f.syntheticApprovedEvent?.text ? [f.syntheticApprovedEvent.text] : [])])
].map(normalized));
if (PUBLIC_H.scenarios.length!==10 || YEOUL_NEW_FAMILY_DRAFTS.length!==8
  || EXPOSED.some(t=>t.length<8)) throw new Error('PUBLIC_HOLDOUT_REFERENCES_CHANGED');

const FAMILY_ID = /^private-sealed-[a-z0-9][a-z0-9_-]{0,55}$/u;
const STAGES = new Set(['no_history','first_contact','acquaintance','friend','trusted_partner']);
const DUPLICATE_LIMIT = 0.65;

/** Does not include source text, original question IDs, content hashes, or private family identifiers. */
export function inspectPrivateYeoulHoldoutDraft(draft, {historicalOriginal=null, knownOriginalAutoFields=false}={}) {
  if (!exact(draft,['schemaVersion','characterId','datasetRole','sourceClass','families']) ||
      draft.schemaVersion!=='yeoul-private-holdout-draft-v1' ||
      draft.characterId!=='yeoul' || draft.datasetRole!=='sealed_holdout' ||
      draft.sourceClass!=='owner_new_unexposed_unverified' ||
      !Array.isArray(draft.families) || draft.families.length<1 || draft.families.length>32 ||
      typeof knownOriginalAutoFields!=='boolean' ||
      (historicalOriginal===null && knownOriginalAutoFields))
    fail('private_holdout_draft_shape');
  let legacy=[];
  if(historicalOriginal!==null){
    const original=preparePrivateYeoulForResearch(historicalOriginal,{knownOriginalAutoFields});
    const questions=new Map();
    for(const row of original.responses)if(!questions.has(row.id))questions.set(row.id,row.input);
    if(questions.size!==12)fail('legacy_coverage');
    legacy=[...questions.values()].map(normalized);
  }
  const ids=new Set(),seenTurns=new Set(),familyTurns=[];
  for(const family of draft.families){
    if(!exact(family,['familyId','relationshipStage','historyAvailable','turns']) ||
      typeof family.familyId!=='string' || !FAMILY_ID.test(family.familyId) ||
      ids.has(family.familyId) || !STAGES.has(family.relationshipStage) ||
      typeof family.historyAvailable!=='boolean' ||
      ((family.relationshipStage==='no_history'||family.relationshipStage==='first_contact') && family.historyAvailable) ||
      !Array.isArray(family.turns) || family.turns.length<1 || family.turns.length>3)
      fail('private_family_shape');
    ids.add(family.familyId);
    const turns=[];
    for(const turn of family.turns){
      if(typeof turn!=='string' || turn.length>500 ||
        turn.trim().length<8 || /[\u0000-\u001f\u007f]/u.test(turn))fail('private_turn_shape');
      const value=normalized(turn);
      if(value.length<8 || seenTurns.has(value))fail('reused_private_turn');
      seenTurns.add(value);
      if(EXPOSED.includes(value))fail('reused_published_scenario');
      turns.push(value);
    }
    familyTurns.push(turns);
  }
  let publishedFlagged=0,legacyFlagged=0,crossFamilyFlagged=0;
  for(let i=0;i<familyTurns.length;i++){
    const cur=familyTurns[i];
    if(cur.some(x=>EXPOSED.some(y=>similarity(x,y)>=DUPLICATE_LIMIT)))publishedFlagged++;
    if(legacy.length && cur.some(x=>legacy.some(y=>similarity(x,y)>=DUPLICATE_LIMIT)))legacyFlagged++;
    if(familyTurns.slice(0,i).some(other=>cur.some(x=>other.some(y=>similarity(x,y)>=DUPLICATE_LIMIT))))
      crossFamilyFlagged++;
  }
  return Object.freeze({
    schemaVersion:'yeoul-private-holdout-preflight-v1',characterId:'yeoul',
    privateFamiliesInspected:familyTurns.length,
    privateTurnsInspected:familyTurns.reduce((n,arr)=>n+arr.length,0),
    publishedComparisonGroupsChecked:18,
    possiblePublishedOverlapFamilies:publishedFlagged,
    possibleHistoricalOverlapFamilies:legacyFlagged,
    possibleWithinDraftOverlapFamilies:crossFamilyFlagged,
    legacyY01toY12Compared:legacy.length===12,
    sourceClaimUnverified:true,independentSemanticReviewVerified:false,
    privateSourceAuthenticityVerified:false,blindEvaluatorReady:false,
    holdoutAdmitted:false,optimizerCanReadHoldout:false,
    ownerApprovalVerified:false,paidExecutionReady:false,productionEligible:false,
    externalCalls:0, decision:'HOLD_PRIVATE_HOLDOUT_UNREVIEWED',
  });
}

async function safeInput(path, maximumBytes){
  const absolute=resolve(path), root=await realpath(ROOT);
  if(within(root,absolute))fail('private_input_inside_repository');
  const item=await lstat(absolute);
  if(!item.isFile() || item.isSymbolicLink() || item.size>maximumBytes)fail('private_input_not_regular');
  const actual=await realpath(absolute);
  if(within(root,actual))fail('private_input_inside_repository');
  if(process.platform!=='win32'){
    const parent=await stat(dirname(actual)), itemMode=await stat(actual);
    if((parent.mode&0o077)!==0 || (itemMode.mode&0o077)!==0)fail('private_permissions_required');
  }
  return {path:actual,data:JSON.parse(await readFile(actual,'utf8'))};
}
async function safeOutput(path){
  const absolute=resolve(path), root=await realpath(ROOT);
  if(!absolute.endsWith('.json') || within(root,absolute))fail('private_output_inside_repository');
  const parent=await realpath(dirname(absolute));
  if(within(root,parent)||within(parent,root))fail('private_output_inside_repository');
  if(process.platform!=='win32' && ((await stat(parent)).mode&0o077)!==0)
    fail('private_permissions_required');
  return resolve(parent,basename(absolute));
}

/** The only artifact is minimum metadata in a NEW private JSON file. Never logs private turns. */
export async function runPrivateYeoulHoldoutPreflight({privateDraft,privateSummary,privateOriginal=null,knownOriginalAutoFields=false}){
  if(typeof privateDraft!=='string'||!privateDraft.trim() ||
     typeof privateSummary!=='string'||!privateSummary.trim() ||
     (privateOriginal!==null && (typeof privateOriginal!=='string'||!privateOriginal.trim())))
    fail('paths_required');
  const input=await safeInput(privateDraft,96*1024);
  const old=privateOriginal===null?null:await safeInput(privateOriginal,2*1024*1024);
  const target=await safeOutput(privateSummary);
  if(target===input.path || (old!==null && target===old.path))fail('source_overwrite');
  const report=inspectPrivateYeoulHoldoutDraft(input.data,{
    historicalOriginal:old?.data??null,knownOriginalAutoFields});
  await writeFile(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  const known=args.at(-1)==='--known-original-unreviewed-auto-fields';
  if(known)args.pop();
  let values=null;
  if(args.length===4&&args[0]==='--private-draft'&&args[2]==='--private-summary')
    values={privateDraft:args[1],privateSummary:args[3]};
  if(args.length===6&&args[0]==='--private-draft'&&args[2]==='--private-summary'&&args[4]==='--private-original')
    values={privateDraft:args[1],privateSummary:args[3],privateOriginal:args[5]};
  if(!values || (known && values.privateOriginal===undefined)){
    console.error('YEOUL_PRIVATE_HOLDOUT_PREFLIGHT_USAGE');
    process.exitCode=2;
  }else{
    runPrivateYeoulHoldoutPreflight({...values,knownOriginalAutoFields:known})
      .then(report=>console.log(JSON.stringify(report)))
      .catch(()=>{console.error('YEOUL_PRIVATE_HOLDOUT_PREFLIGHT_REFUSED');process.exitCode=1;});
  }
}
