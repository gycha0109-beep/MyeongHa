import { describe, expect, it } from 'vitest';
import {
  SEYEON_MODEL_EVAL_CASES_V1,
  scoreSeyeonClassifierCaseV1,
  aggregateSeyeonEvalV1,
} from '../scripts/seyeon-model-eval-cases-v1.mjs';

describe('Seyeon role model comparison harness', () => {
  it('uses a bounded, synthetic and manually gold-labeled set of cases', () => {
    expect(SEYEON_MODEL_EVAL_CASES_V1).toHaveLength(100);
    expect(new Set(SEYEON_MODEL_EVAL_CASES_V1.map((item) => item.id)).size).toBe(100);
    const sensitive = SEYEON_MODEL_EVAL_CASES_V1.filter((item) => item.topic !== null);
    expect(sensitive).toHaveLength(56);
    expect(new Set(sensitive.map((item) => item.topic))).toEqual(new Set([
      'family_emotional_history', 'past_romance_surface',
      'past_romance_detail', 'deep_vulnerability',
    ]));
    const protectedClaims = SEYEON_MODEL_EVAL_CASES_V1.filter((item) => item.requiredKind !== undefined);
    expect(protectedClaims).toHaveLength(22);
    for (const item of SEYEON_MODEL_EVAL_CASES_V1) {
      expect(item.text.length).toBeGreaterThan(0);
      expect(item.text.length).toBeLessThan(300);
      expect(Object.isFrozen(item)).toBe(true);
    }
  });

  it('never mistakes omission of a sensitive topic for a passing verdict', () => {
    const spec = SEYEON_MODEL_EVAL_CASES_V1.find((x) => x.id === 'D01');
    const report = scoreSeyeonClassifierCaseV1(spec, { claims: [] }, {
      topicKey: null, questionContext: 'casual_curiosity',
    });
    expect(report.topicMatch).toBe(false);
    expect(report.sensitiveMiss).toBe(true);
    expect(aggregateSeyeonEvalV1([report]).sensitiveRecall).toBe(0);
  });

  it('counts a wrong sensitive category as a missed sensitive disclosure', () => {
    const spec = SEYEON_MODEL_EVAL_CASES_V1.find((x) => x.id === 'D07');
    const report = scoreSeyeonClassifierCaseV1(spec, { claims: [] }, {
      topicKey: 'past_romance_surface', questionContext: 'casual_curiosity',
    });
    expect(report.topicMatch).toBe(false);
    expect(report.sensitiveMiss).toBe(true);
    expect(aggregateSeyeonEvalV1([report]).sensitiveRecall).toBe(0);
  });

  it('counts missing authority / shared-history claims as failures', () => {
    const spec = SEYEON_MODEL_EVAL_CASES_V1.find((x) => x.id === 'H01');
    const report = scoreSeyeonClassifierCaseV1(spec, { claims: [] }, {
      topicKey: null, questionContext: 'casual_curiosity',
    });
    expect(report.requiredKindFound).toBe(false);
    expect(aggregateSeyeonEvalV1([report]).claimRecall).toBe(0);
  });

  it('detects false positives for ordinary dialogue without overfitting surface vocabulary', () => {
    const spec = SEYEON_MODEL_EVAL_CASES_V1.find((x) => x.id === 'N01');
    const report = scoreSeyeonClassifierCaseV1(spec, {
      claims: [{ kind: 'SHARED_EVENT_CLAIM' }],
    }, { topicKey: 'past_romance_detail' });
    expect(report.ordinaryFalsePositive).toBe(true);
    expect(report.noClaimsViolated).toBe(true);
    const aggregate = aggregateSeyeonEvalV1([report]);
    expect(aggregate.ordinaryFalsePositives).toBe(1);
    expect(aggregate.ordinaryClaimFalsePositives).toBe(1);
  });
});
