import { describe, expect, it } from 'vitest';
import { SEYEON_COST_C02_ALL_GOLD_V1 as GOLD } from
  '../scripts/seyeon-cost-c02-authored-gold-v1.mjs';
import { scoreSeyeonC04PairwiseOfflineV1 as score } from
  '../scripts/seyeon-cost-c04-pairwise-quality-review-v1.mjs';

function row(spec,variant) {
  return {
    caseId:spec.id,variant,outcome:'ok',topicKey:spec.topic,
    claimKinds:spec.requiredKind?[spec.requiredKind]:[],
    serializedRequestBytes:variant==='baseline'?2000:1300,
  };
}
function full() {
  return {scope:'SYNTHETIC_OR_UNVERIFIED_CAPTURE',
    rows:GOLD.flatMap(spec=>[row(spec,'baseline'),row(spec,'compact')])};
}
function replace(x,id,variant,values) {
  const i=x.rows.findIndex(r=>r.caseId===id&&r.variant===variant);
  if(i===-1)throw new Error('Missing test row');
  x.rows[i]={...x.rows[i],...values};
}
const sensitive=GOLD.find(x=>x.topic!==null).id;
const claim=GOLD.find(x=>x.requiredKind).id;
const ordinary=GOLD.find(x=>x.noClaims===true).id;
describe('C04 pairwise review: errorful prompt shrink can never pass on bytes alone',()=>{
  it('scores all 600 explicitly fake predictions but grants NO actual model authority',()=>{
    const r=score(full());
    expect(GOLD).toHaveLength(300);
    expect(r).toMatchObject({
      observedRows:600,expectedCaseCount:300,
      baselineSerializedBytes:600000,compactSerializedBytes:390000,
      savedSerializedBytes:210000,offlineGoldAndByteChecksPass:true,
      paidEvaluationPermitted:false,productionPromotionPermitted:false,
      realModelRecallVerified:false,providerReceiptsVerified:false,
      verdict:'HOLD_REAL_MODEL_AND_OWNER_REVIEW',
    });
    expect(r.baseline.sensitiveMisses).toBe(0);
    expect(r.compact.defectIds).toEqual([]);
  });
  it('a private-topic false negative is a hard defect even when bytes shrink',()=>{
    const x=full();replace(x,sensitive,'compact',{topicKey:null});
    const r=score(x);
    expect(r.compact.sensitiveMisses).toBe(1);
    expect(r.compact.defectIds).toContain(sensitive);
    expect(r.regressionIds).toContain(sensitive);
    expect(r.hardFailureCodes).toContain('COMPACT_GOLD_DEFECT');
    expect(r.savedSerializedBytes).toBeGreaterThan(0);
    expect(r.offlineGoldAndByteChecksPass).toBe(false);
  });
  it('a missed fabricated authority/history claim blocks the fast classifier',()=>{
    const x=full();replace(x,claim,'compact',{claimKinds:[]});
    const r=score(x);
    expect(r.compact.defectIds).toContain(claim);
    expect(r.hardFailureCodes).toContain('COMPACT_REGRESSION');
  });
  it('over-sensitive ordinary talk and hallucinated ordinary claims both HOLD',()=>{
    const x=full();replace(x,ordinary,'compact',{
      topicKey:'deep_vulnerability',claimKinds:['SHARED_EVENT_CLAIM'],
    });
    const r=score(x);
    expect(r.compact.ordinaryFalsePositives).toBe(1);
    expect(r.compact.ordinaryClaimFalsePositives).toBe(1);
    expect(r.offlineGoldAndByteChecksPass).toBe(false);
  });
  it('missing, failed, partial and non-reviewed samples cannot become clean scores',()=>{
    let x=full();x.rows.pop();
    let r=score(x);
    expect(r.compact.goldComplete).toBe(false);
    expect(r.savedSerializedBytes).toBeNull();
    expect(r.hardFailureCodes).toContain('INCOMPLETE_OR_FAILED_CASES');
    x=full();replace(x,sensitive,'compact',{outcome:'error',topicKey:null,claimKinds:[]});
    r=score(x);
    expect(r.compact.unscoredOrFailedIds).toContain(sensitive);
    expect(r.savedSerializedBytes).toBeNull();
  });
  it('baseline defects do not turn candidate improvements into an automatic PASS',()=>{
    const x=full();replace(x,sensitive,'baseline',{topicKey:null});
    const r=score(x);
    expect(r.baseline.defectIds).toContain(sensitive);
    expect(r.hardFailureCodes).toContain('BASELINE_GOLD_DEFECT');
    expect(r.productionPromotionPermitted).toBe(false);
  });
  it('detects disagreement without reading user text or saving raw prompts',()=>{
    const x=full();
    replace(x,claim,'compact',{claimKinds:['META_INSTRUCTION',GOLD.find(g=>g.id===claim).requiredKind]});
    const r=score(x);
    expect(r.disagreementIds).toContain(claim);
    expect(JSON.stringify(r)).not.toContain('우리');
  });
  it('HOLDs a spurious extra authority/history claim even when required gold kind is present',()=>{
    const x=full();
    replace(x,claim,'compact',{claimKinds:[GOLD.find(g=>g.id===claim).requiredKind,
      'SHARED_EVENT_CLAIM']});
    const r=score(x);
    expect(r.compact.defectIds).not.toContain(claim);
    expect(r.compact.unreviewedClaimIds).toContain(claim);
    expect(r.hardFailureCodes).toContain('UNREVIEWED_CLAIM_KIND_REQUIRES_OWNER_LABEL');
    expect(r.offlineGoldAndByteChecksPass).toBe(false);
    expect(r.paidEvaluationPermitted).toBe(false);
  });
  it('HOLDs a claim on a gold case without a claim-kind label instead of inventing a false-positive judgment',()=>{
    const spec=GOLD.find(g=>g.requiredKind===undefined&&g.noClaims!==true);
    if(!spec)throw new Error('Need an under-labelled gold fixture');
    const x=full();replace(x,spec.id,'compact',{claimKinds:['USER_SELF_REPORT']});
    const r=score(x);
    expect(r.compact.unreviewedClaimIds).toContain(spec.id);
    expect(r.compact.defectIds).not.toContain(spec.id);
    expect(r.offlineGoldAndByteChecksPass).toBe(false);
  });
  it('claim kind order alone is not a baseline-vs-compact disagreement',()=>{
    const kind=GOLD.find(g=>g.id===claim).requiredKind;
    const x=full();
    replace(x,claim,'baseline',{claimKinds:[kind,'USER_SELF_REPORT']});
    replace(x,claim,'compact',{claimKinds:['USER_SELF_REPORT',kind]});
    const r=score(x);
    expect(r.disagreementIds).not.toContain(claim);
    expect(r.baseline.unreviewedClaimIds).toContain(claim);
    expect(r.compact.unreviewedClaimIds).toContain(claim);
    expect(r.offlineGoldAndByteChecksPass).toBe(false);
  });
  it('without measured request bytes improvement a perfect oracle still HOLDs',()=>{
    const x=full();
    for(const row of x.rows)if(row.variant==='compact')row.serializedRequestBytes=2200;
    const r=score(x);
    expect(r.hardFailureCodes).toContain('NO_REQUEST_BYTE_REDUCTION');
  });
  it('rejects duplicate, unknown IDs, invalid labels, malformed rows, overflow',()=>{
    const variants=[
      x=>x.rows.push({...x.rows[0]}),
      x=>x.rows[0].caseId='forged',
      x=>x.rows[0].topicKey='invented',
      x=>x.rows[0].claimKinds=['GRANT_AUTHORITY'],
      x=>x.rows[0].claimKinds=['META_INSTRUCTION','META_INSTRUCTION'],
      x=>x.rows[0].claimKinds='none',
      x=>x.rows[0].serializedRequestBytes=0,
      x=>x.rows[0].extra='secret',
    ];
    for(const mutate of variants){
      const x=full();mutate(x);
      expect(()=>score(x)).toThrow();
    }
    const x=full();
    for(const v of x.rows)v.serializedRequestBytes=Number.MAX_SAFE_INTEGER;
    expect(()=>score(x)).toThrow(/safe integer range/u);
  });
});
