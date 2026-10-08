import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveReadingDetailRoute,
} from '../apps/web/reading-detail-route.js';
import {
  resolveSajuButtonEngineRequest,
} from '../apps/web/reading-saju-engine-request.js';
import {
  isBrowserSajuPreviewDeliveryV1,
} from '../apps/web/saju-preview-response-admission.js';
import {
  MyeongHaApiClientV1,
  readCurrentSajuPreviewReadingV1,
} from '../packages/api-client/src/index.js';

const readingId = 'reading-general-natal-test-1';
const responseId = 'reading_response_' + 'a'.repeat(24);

function response() {
  return {
    responseId,
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    messageCode: 'READING_DELIVERED',
    requiredAction: 'none',
    reading: {
      readingId,
      sections: [
        {
          sectionType: 'overview',
          title: '프리뷰 안내',
          state: 'complete',
          blocks: [{ type: 'paragraph', text: '연구 검증 중인 프리뷰입니다.' }],
        },
        {
          sectionType: 'personality',
          title: '원국의 구조',
          state: 'complete',
          blocks: [
            { type: 'paragraph', text: '검증된 원국 해석 문장' },
            { type: 'source_hint', text: '근거 구조: 일간·월주' },
          ],
        },
      ],
      disclosures: [{ type: 'scope_limitation', text: '원국만 표시합니다.' }],
    },
  };
}
function envelope(reading: unknown) {
  return {
    ok: true,
    data: { lifecycle: 'preview', reading },
    meta: { apiContractVersion: 'v0.9', requestId: 'synthetic-2a' },
  };
}

describe('General Natal 2A: existing route → browser guarded Preview integration', () => {
  it('projects one General Natal request and renders the accepted public reading content', async () => {
    const route = resolveReadingDetailRoute('?topic=temperament&scope=original');
    const request = resolveSajuButtonEngineRequest(route);
    expect(request).toMatchObject({ state: 'ready', domain: 'general', readingText: '전체 사주' });
    if (request.state !== 'ready') throw new Error('fixture route must be ready');

    const raw = envelope(response());
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ readingText: '전체 사주' });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-subject-token');
      return Response.json(raw);
    });
    const client = new MyeongHaApiClientV1({
      origin: 'https://myeongha.test',
      fetchImpl,
    });

    const admitted = await readCurrentSajuPreviewReadingV1(
      client, 'synthetic-subject-token', request.readingText,
    );

    expect(admitted).toMatchObject({
      kind: 'delivered',
      readingId,
      steps: [
        { title: '원국의 구조', primary: '검증된 원국 해석 문장',
          structure: ['근거 구조: 일간·월주'] },
      ],
      notices: ['연구 검증 중인 프리뷰입니다.', '원국만 표시합니다.'],
    });
    expect(isBrowserSajuPreviewDeliveryV1(raw)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const runtime = readFileSync(
      new URL('../apps/web/reading-character.js', import.meta.url), 'utf8',
    );
    expect(runtime).toContain("import { isBrowserSajuPreviewDeliveryV1 } from './saju-preview-response-admission.js'");
    expect(runtime).toContain('if (requireBrowserAdmission && !isBrowserSajuPreviewDeliveryV1(payload)) return null;');
    expect(runtime).toContain('const preview = previewStepsFromPayload(payload, { requireBrowserAdmission: true });');
    expect(runtime).toContain('const readingView = previewStepsFromPayload({');
    expect(runtime).toContain('activatePreviewReading(preview);');
    expect(runtime).toContain('if (stage) stage.hidden = false;');
  });

  it.each([
    ['unknown response version', () => ({ ...response(), responseVersion: 'v3' })],
    ['unsupported block', () => ({
      ...response(),
      reading: {
        ...response().reading,
        sections: [{ sectionType: 'overview', state: 'complete', title: '가짜 해석',
          blocks: [{ type: 'prediction', text: '내년에 재회 확정' }] }],
      },
    })],
    ['state contract drift', () => ({ ...response(), messageCode: 'READING_TEMPORARILY_UNAVAILABLE' })],
    ['unsupported state', () => ({ ...response(), state: 'insufficient_evidence' })],
    ['no source disclosures', () => ({ ...response(), reading: { ...response().reading, disclosures: null } })],
    ['empty result sections', () => ({
      ...response(),
      reading: { ...response().reading, sections: [response().reading.sections[0]] },
    })],
  ])('rejects unsafe browser reveal: %s', (_label, makeReading) => {
    expect(isBrowserSajuPreviewDeliveryV1(envelope(makeReading()))).toBe(false);
  });

  it('keeps yearly and unsupported reading requests blocked before synthetic transport', () => {
    const yearly = resolveSajuButtonEngineRequest(resolveReadingDetailRoute('?scope=year'));
    expect(yearly).toMatchObject({ state: 'ready', readingText: '올해 운세' });
    expect(isBrowserSajuPreviewDeliveryV1(envelope({
      ...response(),
      state: 'partial_evidence',
      messageCode: 'READING_EVIDENCE_PARTIAL',
    }))).toBe(false);
  });
});
