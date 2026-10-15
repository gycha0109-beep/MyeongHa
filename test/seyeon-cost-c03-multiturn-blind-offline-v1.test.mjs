import {describe,it,expect} from 'vitest';
import {
  SEYEON_COST_C03_MULTITURN_CASES_V1,SEYEON_COST_C03_TOTAL_TURNS_V1,
  SEYEON_COST_C03_PROBE_KEYS_V1,
} from '../scripts/seyeon-cost-c03-multiturn-cases-v1.mjs';
import {
  prepareSeyeonC03BlindReviewV1,inspectSeyeonC03LexicalRepetitionV1,
} from '../scripts/seyeon-cost-c03-blind-eval-core-v1.mjs';
import {scoreSeyeonC03BlindedManualV1} from '../scripts/seyeon-cost-c03-review-score-v1.mjs';
import {compareSeyeonC03ClassifierDisagreementOfflineV1} from
  '../scripts/seyeon-cost-c03-disagreement-gate-offline-v1.mjs';
import {SEYEON_COST_C02_ALL_GOLD_V1} from '../scripts/seyeon-cost-c02-authored-gold-v1.mjs';

const turns=SEYEON_COST_C03_MULTITURN_CASES_V1.flatMap(c=>
  c.turns.map(t=>({caseId:c.id,id:t.id,userText:t.userText})));
const fakeRun=(route,responseFor=(t)=>'이것은 합성 답변 '+t.id)=>({
  route,scope:'SYNTHETIC_OFFLINE_ONLY',
  turns:turns.map(t=>({...t,response:responseFor(t)})),
});
const packet=()=>prepareSeyeonC03BlindReviewV1({
  baseline:fakeRun('legacy_5'),candidate:fakeRun('fast_3'),
});
function mockRatings(trial){
  return trial.publicPacket.items.flatMap(t=>
    ['X','Y'].flatMap(slot=>['rater_one','rater_two'].map(reviewerId=>({
      reviewerId,turnId:t.id,slot,
      scores:Object.fromEntries(SEYEON_COST_C03_PROBE_KEYS_V1.map(k=>[k,3])),
      violations:[],
    }))));
}
describe('COST-03 authored 10/20/30-turn synthetic-only assessment',()=>{
  it('preserves all 60 distinct authored turns and does not treat in-session history as a Memory Grant',()=>{
    expect(SEYEON_COST_C03_MULTITURN_CASES_V1.map(s=>s.turns.length)).toEqual([10,20,30]);
    expect(SEYEON_COST_C03_TOTAL_TURNS_V1).toBe(60);
    expect(new Set(turns.map(t=>t.id)).size).toBe(60);
    for(const c of SEYEON_COST_C03_MULTITURN_CASES_V1){
      expect(c.sourceCount).toBe(0);
      expect(c.durableMemoryReadsAllowed).toBe(false);
      expect(c.relationshipGate).toBe('PUBLIC');
      expect(c.personaAuthority).toBe('AUTHOR_DRAFT_NOT_PRODUCTION_AUTHORITY');
    }
    expect(SEYEON_COST_C03_PROBE_KEYS_V1).toEqual([
      'initiative','user_agency','voice','emotional_causality',
      'continuity','variety','naturalness',
    ]);
  });

  it('requires complete exact authored prompts and declines arbitrary personal or missing turn input',()=>{
    expect(()=>prepareSeyeonC03BlindReviewV1({
      baseline:fakeRun('legacy_5'),
      candidate:{...fakeRun('fast_3'),turns:turns.slice(0,59)},
    })).toThrow();
    const wrong=fakeRun('fast_3');
    wrong.turns[0].userText='non synthetic user text';
    expect(()=>prepareSeyeonC03BlindReviewV1({
      baseline:fakeRun('legacy_5'),candidate:wrong,
    })).toThrow();
    const repeated=fakeRun('fast_3');
    repeated.turns[1].id=repeated.turns[0].id;
    expect(()=>prepareSeyeonC03BlindReviewV1({
      baseline:fakeRun('legacy_5'),candidate:repeated,
    })).toThrow();
    expect(()=>prepareSeyeonC03BlindReviewV1({
      baseline:fakeRun('legacy_5'),candidate:{
        ...fakeRun('fast_3'),scope:'LIVE_USER',
      },
    })).toThrow();
  });

  it('balances X/Y blind position exactly and never leaks the route mapping into judge packet',()=>{
    const trial=packet(),p=trial.publicPacket;
    expect(p.cases.map(x=>x.turnCount)).toEqual([10,20,30]);
    expect(p.items).toHaveLength(60);
    expect(p.packetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(p)).not.toContain('legacy_5');
    expect(JSON.stringify(p)).not.toContain('fast_3');
    expect(trial.coordinatorKey.keys.filter(x=>x.X==='legacy_5')).toHaveLength(30);
    expect(trial.coordinatorKey.keys.filter(x=>x.X==='fast_3')).toHaveLength(30);
    expect(p.modelQualityVerified).toBe(false);
    expect(p.productionPromotionAllowed).toBe(false);
    expect(packet().publicPacket.packetHash).toBe(p.packetHash);
  });

  it('has no independent-human quality result without 240 complete ratings',()=>{
    const trial=packet();
    expect(scoreSeyeonC03BlindedManualV1(trial,[])).toMatchObject({
      status:'HOLD',reason:'MISSING_OR_INVALID_INDEPENDENT_RATINGS',
      requiredRatings:240,qualityVerified:false,productionPromotionAllowed:false,
    });
    expect(scoreSeyeonC03BlindedManualV1(trial,mockRatings(trial).slice(1)).reason)
      .toBe('MISSING_OR_INVALID_INDEPENDENT_RATINGS');
  });

  it('does not turn identical mocked scores into proven quality or route promotion',()=>{
    const trial=packet(),rating=mockRatings(trial);
    const summary=scoreSeyeonC03BlindedManualV1(trial,rating);
    expect(summary).toMatchObject({
      status:'HOLD',reason:'SCORING_COMPLETE_MODEL_PROVENANCE_UNVERIFIED',
      turnsCompared:60,qualityVerified:false,productionPromotionAllowed:false,
      nonInferiorityProven:false,
    });
    expect(summary.scores.legacy_5.meanScore).toBe(3);
    expect(summary.scores.fast_3.meanScore).toBe(3);
    expect(summary.scores.fast_3.turns).toBe(60);
  });

  it('any flagged critical violation keeps the packet HOLD; reviewer identity duplicates also HOLD',()=>{
    const trial=packet(),r=mockRatings(trial);
    r[0].violations.push('FABRICATED_SHARED_MEMORY');
    expect(scoreSeyeonC03BlindedManualV1(trial,r).reason)
      .toBe('CRITICAL_VIOLATION_FLAGGED');
    const duplicated=mockRatings(trial);
    duplicated[1].reviewerId=duplicated[0].reviewerId;
    expect(scoreSeyeonC03BlindedManualV1(trial,duplicated).reason)
      .toBe('DUPLICATE_OR_INCOMPLETE_INDEPENDENCE');
  });

  it('reports repetition diagnostic without inventing character quality scores',()=>{
    const trial=prepareSeyeonC03BlindReviewV1({
      baseline:fakeRun('legacy_5',()=> '네. 무엇을 도와드릴까요?'),
      candidate:fakeRun('fast_3',t=> '다른 응답 '+t.id),
    });
    const x=inspectSeyeonC03LexicalRepetitionV1(trial);
    // 60 fixed replies split into two balanced 30-turn slot streams: 29+29.
    expect(x.X.exactDuplicateCount+x.Y.exactDuplicateCount).toBe(58);
    expect(x.X.diagnosticOnly&&x.Y.diagnosticOnly).toBe(true);
  });

  it('synthetic independent-vs-unified disagreement causes HOLD on gold-sensitive model misses',()=>{
    const pin={scope:'SYNTHETIC_OFFLINE',characterId:'seyeon',sourceSelection:'zero_only'};
    let mismatches=0;
    for(const spec of SEYEON_COST_C02_ALL_GOLD_V1){
      const correct={topicKey:spec.topic,claimKinds:spec.requiredKind?[spec.requiredKind]:[]};
      const missed={topicKey:null,claimKinds:[]};
      const result=compareSeyeonC03ClassifierDisagreementOfflineV1({
        unified:missed,independent:correct,ownerEvidence:pin,
      });
      expect(result.canGrantPrivateSource).toBe(false);
      expect(result.usableInProduction).toBe(false);
      if(spec.topic!==null||spec.requiredKind!==undefined){
        expect(result).toMatchObject({status:'HOLD',reason:'CLASSIFIER_DISAGREEMENT'});
        mismatches++;
      }else{
        expect(result).toMatchObject({status:'UNVERIFIED',
          reason:'TWO_CLASSIFIERS_AGREE_BUT_MAY_BOTH_BE_WRONG'});
      }
    }
    expect(mismatches).toBeGreaterThan(100);
    expect(mismatches).toBeLessThan(300);
    expect(compareSeyeonC03ClassifierDisagreementOfflineV1({
      unified:{topicKey:null,claimKinds:[]},
      independent:{topicKey:null,claimKinds:[]},
      ownerEvidence:pin,
    }).canGrantPrivateSource).toBe(false);
    expect(compareSeyeonC03ClassifierDisagreementOfflineV1({
      unified:{topicKey:null,claimKinds:[]},
      independent:{topicKey:null,claimKinds:[]},
      ownerEvidence:{...pin,sourceSelection:'positive'},
    }).status).toBe('HOLD');
  });
});
