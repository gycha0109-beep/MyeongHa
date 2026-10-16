/** Two-independent-reviewer completeness and safety-score summary.
 * Does not determine model/Production fitness. Model provenance is unverifiable
 * from a caller-supplied dialogue packet; never promote on this result.
 */
import {SEYEON_COST_C03_PROBE_KEYS_V1,SEYEON_COST_C03_HARD_VIOLATIONS_V1,SEYEON_COST_C03_TOTAL_TURNS_V1} from './seyeon-cost-c03-multiturn-cases-v1.mjs';
function hold(reason,extra={}){
  return Object.freeze({status:'HOLD',reason,qualityVerified:false,productionPromotionAllowed:false,...extra});
}
function valid(r){
  return r&&typeof r==='object'&&typeof r.reviewerId==='string'&&/^[A-Za-z0-9_-]{2,64}$/.test(r.reviewerId)&&
  typeof r.turnId==='string'&&['X','Y'].includes(r.slot)&&
  r.scores&&typeof r.scores==='object'&&!Array.isArray(r.scores)&&
  Object.keys(r.scores).length===SEYEON_COST_C03_PROBE_KEYS_V1.length&&
  SEYEON_COST_C03_PROBE_KEYS_V1.every(k=>Number.isInteger(r.scores[k])&&r.scores[k]>=0&&r.scores[k]<=4)&&
  Array.isArray(r.violations)&&r.violations.every(k=>SEYEON_COST_C03_HARD_VIOLATIONS_V1.includes(k))&&
  new Set(r.violations).size===r.violations.length;
}
export function scoreSeyeonC03BlindedManualV1(trial,ratings){
  const packet=trial?.publicPacket, coordinator=trial?.coordinatorKey;
  if(packet?.items?.length!==SEYEON_COST_C03_TOTAL_TURNS_V1||
     coordinator?.keys?.length!==SEYEON_COST_C03_TOTAL_TURNS_V1||
     coordinator.packetHash!==packet.packetHash)
    return hold('INVALID_PACKET');
  if(!Array.isArray(ratings)||ratings.length!==SEYEON_COST_C03_TOTAL_TURNS_V1*4||
     !ratings.every(valid))
    return hold('MISSING_OR_INVALID_INDEPENDENT_RATINGS',{
      requiredRatings:SEYEON_COST_C03_TOTAL_TURNS_V1*4,
      receivedRatings:Array.isArray(ratings)?ratings.length:0,
    });
  const map=new Map();
  for(const r of ratings){
    const k=r.turnId+'/'+r.slot;
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(r);
  }
  if(map.size!==SEYEON_COST_C03_TOTAL_TURNS_V1*2||
    [...map.values()].some(group=>group.length!==2||group[0].reviewerId===group[1].reviewerId)||
    packet.items.some(item=>!map.has(item.id+'/X')||!map.has(item.id+'/Y')))
    return hold('DUPLICATE_OR_INCOMPLETE_INDEPENDENCE');
  const data=Object.fromEntries(['legacy_5','fast_3'].map(route=>[route,{
    total:0,steps:0,criticalFlags:0,disagreements:0,
    dimensionTotals:Object.fromEntries(SEYEON_COST_C03_PROBE_KEYS_V1.map(k=>[k,0])),
  }]));
  for(const item of coordinator.keys){
    for(const slot of ['X','Y']){
      const entry=map.get(item.id+'/'+slot);
      const target=data[item[slot]];
      if(!target)return hold('MALFORMED_COORDINATOR_KEY');
      target.steps++;
      target.criticalFlags+=new Set(entry.flatMap(x=>x.violations)).size;
      for(const dim of SEYEON_COST_C03_PROBE_KEYS_V1){
        const pair=entry.map(x=>x.scores[dim]);
        target.total+=(pair[0]+pair[1])/2;
        target.dimensionTotals[dim]+=(pair[0]+pair[1])/2;
        if(Math.abs(pair[0]-pair[1])>=2)target.disagreements++;
      }
    }
  }
  const summary=Object.fromEntries(Object.entries(data).map(([route,v])=>[route,Object.freeze({
    turns:v.steps,
    meanScore:Number((v.total/(v.steps*SEYEON_COST_C03_PROBE_KEYS_V1.length)).toFixed(3)),
    criticalFlags:v.criticalFlags,
    raterDisagreements:v.disagreements,
    dimensions:Object.freeze(Object.fromEntries(Object.entries(v.dimensionTotals).map(
      ([dim,total])=>[dim,Number((total/v.steps).toFixed(3))],
    ))),
  })]));
  const critical=Object.values(data).some(v=>v.criticalFlags>0);
  return hold(critical?'CRITICAL_VIOLATION_FLAGGED':'SCORING_COMPLETE_MODEL_PROVENANCE_UNVERIFIED',{
    turnsCompared:SEYEON_COST_C03_TOTAL_TURNS_V1,
    scores:Object.freeze(summary),
    // No numeric improvement claim until source, model and reviewer
    // independence, Canon version, cost/latency and Owner approval are verified.
    nonInferiorityProven:false,
  });
}
