import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import { hashSajuHeldSourceProofRequestV1 as hashJson } from './saju-held-source-proof-verifier-v1.js';
import { verifySajuT10ProductionPairIssueV1 } from './saju-t10-production-pair-issue-source-v1.js';

type PairIssueInput = Parameters<typeof verifySajuT10ProductionPairIssueV1>[0];
const slots = [
  ['year', '연주'], ['month', '월주'], ['day', '일주'], ['hour', '시주'],
] as const;
type DisplayPillar = {status:'resolved'|'unavailable'; value?:string};
type DisplayChart = {role:'self'|'partner';pillars:Record<'year'|'month'|'day'|'hour', DisplayPillar>};
type SourceUnit = {unitId:string;ruleId:string;paragraph:string;
  observedFactPaths:string[];calculationSourceIds:string[];sourceDefinitionHashes:string[]};
type PairBody = {
  readingId:string;materialHash:string;charts:unknown[];
  chartDisplays:[DisplayChart,DisplayChart]; units:SourceUnit[];
};

/**
 * A display-only deterministic projection of a *verified signed* Saju result.
 * It does not infer relationship outcomes, aggregate scores or new meaning.
 * Private issuance proof and chart identities remain separate immutable evidence.
 */
export function projectSignedSajuT10PairProductReadingV1(input: PairIssueInput) {
  const verified = verifySajuT10ProductionPairIssueV1(input);
  if (verified === null) return null;
  const source = verified.body as PairBody;
  const [self, partner] = source.chartDisplays;
  const birth = input.scope.request.birth;
  const pairDetails = [self, partner].flatMap((chart, index) => slots.map(([slot, label]) => ({
    label: (index === 0 ? '본인 ' : '상대 ') + label,
    value: chart.pillars[slot].status === 'resolved'
      ? chart.pillars[slot].value! : '미확인',
  })));
  const selfFacts = Object.fromEntries(slots.map(([slot, label]) => [
    slot, { label, status: self.pillars[slot].status,
      ...(self.pillars[slot].status === 'resolved' ? { value: self.pillars[slot].value } : {}) },
  ]));
  const payload = input.proof as { payload: { issuedAtMs: number } };
  const response = Object.freeze({
    responseId: 'reading_response_' + hashJson({
      readingId: input.readingId, sourceResponseHash: verified.responseHash,
      sourceMaterialHash: source.materialHash,
    }).slice(0, 24),
    responseVersion: 'myeonghwa-product-reading-response-v2' as const,
    state: 'delivered' as const,
    messageCode: 'READING_DELIVERED' as const,
    requiredAction: 'none' as const,
    reading: {
      readingId: input.readingId,
      brand: { brandId: 'myeonghwa' as const, displayName: '명화' as const },
      subject: {
        birthInputDisplay: {
          calendarType: birth.calendarType,
          date: birth.date,
          ...('time' in birth && typeof birth.time === 'string' ? { time: birth.time } : {}),
          timeKnown: 'time' in birth && typeof birth.time === 'string',
        },
        calculationState: 'resolved' as const,
      },
      calculationSummary: { pillars: selfFacts },
      sections: [
        {
          sectionType: 'structure' as const, title: '두 사람의 명식',
          state: 'complete' as const,
          blocks: [{ type: 'fact_table' as const, rows: pairDetails }],
        },
        {
          sectionType: 'compatibility' as const,
          title: '두 사람의 관계 구조 해석',
          state: 'complete' as const,
          blocks: source.units.map(unit => ({
            type: 'paragraph' as const, text: unit.paragraph,
          })),
        },
      ],
      disclosures: [] as readonly { type: 'scope_limitation'; text: string }[],
      generatedAt: new Date(payload.payload.issuedAtMs).toISOString(),
    },
  });
  const displayed = projectProductReadingResponseV2(response);
  if (displayed.kind !== 'delivered' || displayed.readingId !== input.readingId ||
      displayed.steps.length !== 2 ||
      displayed.steps[1]?.supporting.length !== source.units.length - 1) {
    throw new Error('Verified official T10 projection lost signed Korean reading units.');
  }
  return Object.freeze({
    state: 'verified_pair_display_candidate' as const,
    response,
    storedResponseHash: 'sha256:v1:' + hashJson(response),
    sourceBody: verified.body,
    sourceProof: verified.proof,
    originalSignedBodyHash: verified.responseHash,
    materialHash: verified.materialHash,
  });
}
