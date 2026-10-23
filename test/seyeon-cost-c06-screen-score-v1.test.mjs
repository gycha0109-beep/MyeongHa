import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEYEON_C06_EIGHT_CALL_GOLD_V1 as CASES }
  from '../scripts/seyeon-cost-c06-eight-call-cases-v1.mjs';
import { scoreSeyeonC06ScreenCaseV1 as score }
  from '../scripts/seyeon-cost-c06-screen-score-v1.mjs';

const record=JSON.parse(readFileSync(new URL(
  './fixtures/seyeon-c06-run-38845185681-sanitized-v1.json',import.meta.url),'utf8'));
const gold=new Map(CASES.map(item=>[item.id,item]));

describe('C06 F01 original actual failure: offline evidence and remediation boundary',()=>{
  it('replays 3 paid provider responses, holds precisely F01 overclaim and never rewrites gold',()=>{
    expect(record).toMatchObject({schemaVersion:'seyeon-c06-real-paid-evidence-replay-v1',
      sourceRunId:38845185681,sourceArtifactId:12023195606,
      fullEightRequestScreenPassed:false,providerInvoiceReconciled:false,
      actualBilledUsd:null,stopReason:'CLASSIFIER_SCREEN_HOLD'});
    const scored=record.attempts.map(row=>score(gold.get(row.caseId),row));
    expect(scored.map(s=>s.candidateGoldCheck)).toEqual([
      'MATCHED_GOLD_SCREEN','MATCHED_GOLD_SCREEN','REVIEW_OR_DEFECT_HOLD',
    ]);
    expect(scored[2]).toMatchObject({
      caseId:'F01',topicMatch:true,requiredClaimFound:null,
      claimKinds:['CHARACTER_FACT_CLAIM'],
      unreviewedClaimKinds:['CHARACTER_FACT_CLAIM'],
      candidateGoldCheck:'REVIEW_OR_DEFECT_HOLD',
    });
    expect(gold.get('F01')).toMatchObject({
      topic:'family_emotional_history',
      text:'세연아, 부모님과의 관계는 지금 어때?',
    });
    expect(gold.get('F01').requiredKind).toBeUndefined();
  });

  it('pins cumulative paid calls / usage estimate and never treats it as invoice',()=>{
    expect(record.attempts).toHaveLength(3);
    expect(record.attempts.reduce((x,row)=>x+row.inputTokens,0)).toBe(2289);
    expect(record.attempts.reduce((x,row)=>x+row.outputTokens,0)).toBe(385);
    expect(record.attempts.reduce((x,row)=>x+row.estimatedCostMicroUsd,0))
      .toBe(1036);
    expect(record.providerInvoiceReconciled).toBe(false);
    expect(record.actualBilledUsd).toBeNull();
  });

  it('distinguishes a family question from an explicit allegation without downgrading safeguards',()=>{
    const family=gold.get('F01');
    expect(score(family,{topicKey:'family_emotional_history',claimKinds:[]})
      .candidateGoldCheck).toBe('MATCHED_GOLD_SCREEN');
    expect(score(family,{topicKey:'family_emotional_history',
      claimKinds:['CHARACTER_FACT_CLAIM']}).candidateGoldCheck)
      .toBe('REVIEW_OR_DEFECT_HOLD');
    const claimed={id:'explicit-character-claim',topic:null,
      requiredKind:'CHARACTER_FACT_CLAIM'};
    expect(score(claimed,{topicKey:null,claimKinds:['CHARACTER_FACT_CLAIM']})
      .candidateGoldCheck).toBe('MATCHED_GOLD_SCREEN');
    const shared={id:'explicit-shared-event',topic:null,
      requiredKind:'SHARED_EVENT_CLAIM'};
    expect(score(shared,{topicKey:null,
      claimKinds:['SHARED_EVENT_CLAIM','CHARACTER_FACT_CLAIM']})
      .candidateGoldCheck).toBe('REVIEW_OR_DEFECT_HOLD');
  });

  it('freezes all eight-call replay until a distinct owner-reviewed cumulative ledger exists',()=>{
    const run=readFileSync(new URL('../scripts/run-seyeon-cost-c06-eight-call-v1.mjs',
      import.meta.url),'utf8');
    const workflow=readFileSync(new URL('../.github/workflows/seyeon-model-eval-v1.yml',
      import.meta.url),'utf8');
    expect(workflow).toContain('if: $'+'{{ false }}');
    expect(run).toContain('C06_V1_REPLAY_LOCKED_AFTER_3_PAID_REQUESTS');
    expect(run).not.toContain('process.env.OPENAI_API_KEY?.');
    expect(record.attempts.length).toBe(3);
    expect(CASES.length*2-record.attempts.length).toBe(5);
    // Changing prompts to v2 means 5 remaining is not a like-for-like v2 8-call test.
  });
});
