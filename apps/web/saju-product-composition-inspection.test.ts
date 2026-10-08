import { describe, expect, it } from 'vitest';
import {
  SAJU_PRODUCT_COMPOSITION_RESEARCH_FIXTURES_V1,
  inspectSajuProductCompositionV1,
} from './saju-product-composition-inspection.js';

const general = SAJU_PRODUCT_COMPOSITION_RESEARCH_FIXTURES_V1.generalNatal;
const reunion = SAJU_PRODUCT_COMPOSITION_RESEARCH_FIXTURES_V1.seyeonReunion;

function manifest(slots: readonly unknown[]) {
  return {
    schemaVersion: 'v1',
    productId: 'fixture-product',
    productVersion: 'candidate-1',
    mode: 'inspection_only',
    slots,
  };
}

describe('Saju product composition inspection boundary', () => {
  it('reuses the existing route adapter for the smallest natal end-to-end request candidate', () => {
    const result = inspectSajuProductCompositionV1(general);

    expect(result.state).toBe('request_projection_complete');
    expect(result.requests).toEqual([
      {
        slotId: 'natal',
        requirement: 'required',
        domain: 'general',
        readingText: '전체 사주',
        adapterVersion: 'myeonghwa-consumer-reading-request-adapter-v2',
        mappingVersion: 'myeongha-saju-button-request-v1',
      },
    ]);
    expect(result.releaseAuthorization).toBe('NOT_EVALUATED');
    expect(result.canExecute).toBe(false);
    expect(result.canPublish).toBe(false);
    expect(result.canSell).toBe(false);
  });

  it('composes relationship and annual request candidates without inventing a reunion claim', () => {
    const result = inspectSajuProductCompositionV1(reunion);

    expect(result.state).toBe('request_projection_complete');
    expect(result.requests.map((request) => [request.domain, request.readingText])).toEqual([
      ['relationship', '연애운'],
      ['general', '올해 운세'],
    ]);
    expect(result.requests.some((request) => /재회|첫사랑|확률|시기 보장/u.test(request.readingText))).toBe(false);
    expect(result.canExecute).toBe(false);
    expect(result.canPublish).toBe(false);
    expect(result.canSell).toBe(false);
  });

  it('requires explicit second-person input for a required compatibility slot', () => {
    const product = manifest([
      { slotId: 'compatibility', requirement: 'required', routeSearch: '?topic=compatibility' },
    ]);
    const pending = inspectSajuProductCompositionV1(product);

    expect(pending).toMatchObject({
      state: 'requires_input',
      requests: [],
      requiredInputs: [{ slotId: 'compatibility', input: 'target_person' }],
      canExecute: false,
    });

    const filled = inspectSajuProductCompositionV1(product, {
      compatibility: { targetPersonRef: 'person-revision-1' },
    });
    expect(filled.state).toBe('request_projection_complete');
    expect(filled.requests[0]).toMatchObject({
      domain: 'compatibility',
      targetPersonRef: 'person-revision-1',
    });
  });

  it('may omit an optional question when no explicit user question is supplied', () => {
    const result = inspectSajuProductCompositionV1(manifest([
      { slotId: 'natal', requirement: 'required', routeSearch: '?topic=temperament' },
      { slotId: 'question', requirement: 'optional', routeSearch: '?topic=question-specific' },
    ]));

    expect(result.state).toBe('request_projection_complete');
    expect(result.requests.map((request) => request.slotId)).toEqual(['natal']);
    expect(result.omittedOptionalSlots).toEqual([
      { slotId: 'question', reason: 'requires_input', input: 'question' },
    ]);
  });

  it('rejects duplicate reading route identities and duplicate slots', () => {
    expect(inspectSajuProductCompositionV1(manifest([
      { slotId: 'first', requirement: 'required', routeSearch: '?topic=career' },
      { slotId: 'second', requirement: 'optional', routeSearch: '?topic=career&scope=original' },
    ])).reason).toBe('invalid_manifest');

    expect(inspectSajuProductCompositionV1(manifest([
      { slotId: 'same', requirement: 'required', routeSearch: '?topic=career' },
      { slotId: 'same', requirement: 'optional', routeSearch: '?topic=money' },
    ])).reason).toBe('invalid_manifest');
  });

  it.each([
    '?topic=nonexistent',
    '?topic=love&scope=year',
    '?topic=love&topic=career',
    '?topic=love&freeform=true',
    '?',
  ])('fails closed for unsupported or ambiguous route %s', (routeSearch) => {
    expect(inspectSajuProductCompositionV1(manifest([
      { slotId: 'reading', requirement: 'required', routeSearch },
    ])).state).toBe('blocked');
  });

  it('rejects manifests that attempt to supply commercial activation authority', () => {
    const result = inspectSajuProductCompositionV1({
      ...general,
      saleable: true,
      entitlementKey: 'paid',
    });
    expect(result).toMatchObject({
      state: 'blocked',
      reason: 'invalid_manifest',
      canSell: false,
      canPublish: false,
    });
  });

  it('rejects unknown slot contexts and invalid projected requests', () => {
    expect(inspectSajuProductCompositionV1(general, {
      hidden: { question: 'permission' },
    }).reason).toBe('unknown_context_slot');

    const queryProduct = manifest([
      { slotId: 'question', requirement: 'required', routeSearch: '?topic=question-specific' },
    ]);
    expect(inspectSajuProductCompositionV1(queryProduct, {
      question: { question: '가'.repeat(200) },
    }).reason).toBe('invalid_request_projection');
  });

  it('is deterministic and keeps its result and request slots immutable', () => {
    const left = inspectSajuProductCompositionV1(reunion);
    const right = inspectSajuProductCompositionV1(reunion);

    expect(right).toEqual(left);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.requests)).toBe(true);
    expect(Object.isFrozen(left.requests[0])).toBe(true);
  });
});
