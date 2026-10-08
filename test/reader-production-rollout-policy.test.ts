import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_READER_RUNTIME_IDS_V1,
  READER_RUNTIME_INTERNAL_PREVIEW_CANDIDATES_V1,
  READER_RUNTIME_PUBLIC_ACTIVATED_V1,
  ReaderRuntimeRolloutWithheldErrorV1,
  assertReaderRuntimeInternalPreviewCandidateV1,
  resolveReaderRuntimeRolloutCandidateV1,
} from '../apps/api/src/reader-production-rollout-policy-v1.js';
import { MOBILE_READER_PRESENTATIONS_V1 } from '../apps/mobile/src/features/reading/mobile-reader-presentation.js';
import {
  parseReaderInterpretationPreviewHttpRequestV1,
} from '../apps/api/src/reader-interpretation-preview-http.js';
import {
  parseProductionReaderInterpretationActivationConfigV1,
} from '../apps/api/src/production-reader-interpretation-activation.js';

const source = async (path: string) =>
  readFile(new URL('../' + path, import.meta.url), 'utf8');

describe('server-side first tranche for the shared Character Reader runtime', () => {
  it('has all nine canonical Character runtime identities with only Se-yeon staged', () => {
    expect(OFFICIAL_READER_RUNTIME_IDS_V1).toHaveLength(9);
    expect([...OFFICIAL_READER_RUNTIME_IDS_V1]).toEqual(
      MOBILE_READER_PRESENTATIONS_V1.map(x => x.key),
    );
    expect(READER_RUNTIME_INTERNAL_PREVIEW_CANDIDATES_V1).toEqual(['seyeon']);
    expect(READER_RUNTIME_PUBLIC_ACTIVATED_V1).toBe(false);
  });

  it('keeps future Character concepts withheld, not implicitly available through the shared runtime', () => {
    expect(resolveReaderRuntimeRolloutCandidateV1('seyeon')).toEqual({
      status: 'candidate', readerCharacterId: 'seyeon',
    });
    expect(() => assertReaderRuntimeInternalPreviewCandidateV1('seyeon')).not.toThrow();
    for (const reader of OFFICIAL_READER_RUNTIME_IDS_V1.filter(id => id !== 'seyeon')) {
      expect(resolveReaderRuntimeRolloutCandidateV1(reader)).toMatchObject({
        status: 'withheld', readerCharacterId: reader, reason: 'concept_pending',
      });
      expect(() => assertReaderRuntimeInternalPreviewCandidateV1(reader))
        .toThrow(ReaderRuntimeRolloutWithheldErrorV1);
    }
  });

  it('fails closed for unknown, untrusted or browser-modified Reader identifiers', () => {
    for (const id of ['SeYeon', ' seyeon ', 'random', '', null, undefined, {}, ['seyeon']]) {
      expect(resolveReaderRuntimeRolloutCandidateV1(id)).toMatchObject({
        status: 'withheld', readerCharacterId: null, reason: 'unknown_reader',
      });
      expect(() => assertReaderRuntimeInternalPreviewCandidateV1(id))
        .toThrowError(ReaderRuntimeRolloutWithheldErrorV1);
    }
  });

  it('does not accept Reader identity, payment or entitlement claims in client request', () => {
    for (const payload of [
      { threadId: 'thread-id', officialReadingId: 'reading-id', readerCharacterId: 'seyeon' },
      { threadId: 'thread-id', officialReadingId: 'reading-id', paymentVerified: true },
      { threadId: 'thread-id', officialReadingId: 'reading-id', entitlement: true },
    ]) {
      expect(() => parseReaderInterpretationPreviewHttpRequestV1(payload))
        .toThrow();
    }
  });

  it('integrates only at the server-resolved, Official Reading checked runtime seam', async () => {
    const [production, http, runtime, web] = await Promise.all([
      source('apps/api/src/production-reader-interpretation-activation.ts'),
      source('apps/api/src/reader-interpretation-preview-http.ts'),
      source('apps/api/src/reader-interpretation-preview-runtime-v1.ts'),
      source('apps/web/reader-rollout-policy.js'),
    ]);
    expect(production).toContain('admitServerReader: assertReaderRuntimeInternalPreviewCandidateV1');
    expect(http).toContain('admitServerReader: input.admitServerReader');
    expect(runtime).toContain('input.admitServerReader?.(prepared.source.readerCharacterId);');
    expect(runtime.indexOf('input.admitServerReader?.(prepared.source.readerCharacterId);'))
      .toBeGreaterThan(runtime.indexOf('prepared = await prepareCharacterStandardReadingServerRuntimeV1('));
    expect(runtime.indexOf('input.admitServerReader?.(prepared.source.readerCharacterId);'))
      .toBeLessThan(runtime.indexOf('return renderResolvedReaderInterpretationPreviewV1({\n    source: prepared.source'));
    expect(web).toContain("READER_PREVIEW_CANDIDATE_IDS_V1 = Object.freeze(['seyeon'])");
    expect(web).toContain('READER_PUBLIC_INTERPRETATION_ENABLED_V1 = false');
    expect(parseProductionReaderInterpretationActivationConfigV1({}).mode).toBe('off');
  });
});
