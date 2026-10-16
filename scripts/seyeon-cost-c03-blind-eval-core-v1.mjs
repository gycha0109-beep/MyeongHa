/** Offline-only paired dialogue evaluation. No provider, personal sources, or runtime routing. */
import {createHash} from 'node:crypto';
import {SEYEON_COST_C03_MULTITURN_CASES_V1,SEYEON_COST_C03_PROBE_KEYS_V1,SEYEON_COST_C03_HARD_VIOLATIONS_V1,SEYEON_COST_C03_TOTAL_TURNS_V1} from './seyeon-cost-c03-multiturn-cases-v1.mjs';
const gold=SEYEON_COST_C03_MULTITURN_CASES_V1.flatMap(s=>s.turns.map(t=>({caseId:s.id,...t})));
const ids=new Set(gold.map(t=>t.id));
function sha(v){return createHash('sha256').update(v).digest('hex');}
function rows(route,input){
  if(!input||input.route!==route||input.scope!=='SYNTHETIC_OFFLINE_ONLY'||!Array.isArray(input.turns)||input.turns.length!==60)
    throw new TypeError('Incomplete synthetic route');
  const map=new Map();
  for(const row of input.turns){
    const t=gold.find(x=>x.id===row?.id);
    if(!t||map.has(row.id)||row.userText!==t.userText||row.caseId!==t.caseId||
      typeof row.response!=='string'||!row.response.trim()||row.response.length>2000)
      throw new TypeError('Invalid synthetic turn');
    map.set(row.id,row.response);
  }
  if(map.size!==60)throw new TypeError('Missing synthetic turns');
  return map;
}
/** Coordinator must withhold the key; route identifiers are not exposed in publicPacket. */
export function prepareSeyeonC03BlindReviewV1({baseline,candidate}={}){
  const a=rows('legacy_5',baseline),b=rows('fast_3',candidate);
  const key=[],items=[];
  for(let i=0;i<gold.length;i++){
    const t=gold[i],flip=i%2===1;
    key.push(Object.freeze({id:t.id,X:flip?'fast_3':'legacy_5',Y:flip?'legacy_5':'fast_3'}));
    items.push(Object.freeze({
      id:t.id,caseId:t.caseId,turnIndex:t.turnIndex,
      userText:t.userText,primaryProbe:t.primaryProbe,
      candidates:Object.freeze({X:flip?b.get(t.id):a.get(t.id),Y:flip?a.get(t.id):b.get(t.id)}),
    }));
  }
  const hash=sha(JSON.stringify(items));
  return Object.freeze({
    publicPacket:Object.freeze({
      version:'seyeon-cost-c03-blind-packet-v1',
      status:'AWAITING_INDEPENDENT_REVIEW',
      scope:'SYNTHETIC_OFFLINE_ONLY',
      packetHash:hash,
      modelQualityVerified:false,productionPromotionAllowed:false,
      dimensions:SEYEON_COST_C03_PROBE_KEYS_V1,
      violationKeys:SEYEON_COST_C03_HARD_VIOLATIONS_V1,
      cases:Object.freeze(SEYEON_COST_C03_MULTITURN_CASES_V1.map(s=>({id:s.id,turnCount:s.turns.length}))),
      items:Object.freeze(items),
    }),
    coordinatorKey:Object.freeze({packetHash:hash,keys:Object.freeze(key)}),
  });
}
export function inspectSeyeonC03LexicalRepetitionV1(trial){
  if(trial?.publicPacket?.items?.length!==SEYEON_COST_C03_TOTAL_TURNS_V1)
    throw new TypeError('Incomplete C03 trial');
  return Object.freeze(Object.fromEntries(['X','Y'].map(slot=>{
    const full=new Map(),prefix=new Map();
    for(const row of trial.publicPacket.items){
      const utterance=row.candidates[slot].normalize('NFC').trim(),head=utterance.slice(0,14);
      full.set(utterance,(full.get(utterance)||0)+1);
      if(head.length>=10)prefix.set(head,(prefix.get(head)||0)+1);
    }
    return [slot,Object.freeze({
      exactDuplicateCount:[...full.values()].reduce((n,v)=>n+Math.max(0,v-1),0),
      repeated14CharOpenings:[...prefix.values()].reduce((n,v)=>n+Math.max(0,v-1),0),
      diagnosticOnly:true,
    })];
  })));
}
