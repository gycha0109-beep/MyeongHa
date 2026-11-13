import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1 } from '../../../packages/domain/src/index.js';
import { projectSajuCanonicalReaderGroundingV1 } from './saju-canonical-reader-source-v1.js';
import { hashSajuHeldSourceProofRequestV1 as hash } from './saju-held-source-proof-verifier-v1.js';
import {
  createSajuProductionReadingIssueSourceV1,
  verifyArchivedSajuProductionIssueProofV1,
} from './saju-production-reading-issue-source-v1.js';

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const readingId = randomUUID();
  const nativeReadingId = 'isolated-temporal-reading';
  const executionAttemptId = randomUUID();
  const sourceBirthRevisionId = randomUUID();
  const sourceBirthInputHash = 'sha256:v1:' + 'b'.repeat(64);
  const externalRequestRef = 'saju_source_' + randomUUID();
  const referenceDateTime = '2026-11-07T09:52:00.000Z';
  const releaseRef = 'isolated-month-v1';
  const engineVersion = 'isolated-engine';
  const snapshotId = 'isolated-calculation';
  const request = {
    birth: { calendarType: 'solar', date: '1992-07-14', time: '15:20', sex: 'female' },
    reading: { text: '이번 달', periodReferenceDateTime: referenceDateTime },
  } as const;
  const stableReading = { readingId: nativeReadingId };
  const stable = {
    responseVersion: 'myeonghwa-product-reading-response-v2', state: 'delivered',
    messageCode: 'READING_DELIVERED', requiredAction: 'none', reading: stableReading,
  };
  const response = { ...stable, responseId: 'isolated-response', reading: { ...stableReading, generatedAt: referenceDateTime } };
  const storedResponse = { ...response, reading: { ...response.reading, readingId } };
  const storedResponseHash = 'sha256:v1:' + hash(storedResponse);
  const units = ['a', 'b'].map((key, index) => ({
    unitId: 'grounding_unit_v2_' + key.repeat(24),
    domain: 'general', axis: 'timing', narrativeRole: 'primary',
    semanticKey: 'general:temporal:fixture-' + index, canonicalMeaning: '격리 검증 판정 ' + index,
    sourceCanonicalUnitRefs: ['canonical_reading_unit_' + key.repeat(24)],
    qualifiers: [], prohibitedExtensions: [], requiredCompanionUnitRefs: [],
    requiredDisclosureRefs: [], realizationPolicyRef: 'bounded_semantic_paraphrase_v1',
  }));
  const semanticHash = 'c'.repeat(64);
  const readerSource = {
    grounding: {
      schemaVersion: 'myeonghwa-character-grounding-v2',
      projectionVersion: 'myeonghwa-character-grounding-projection-v3',
      axisRegistryVersion: SAJU_GROUNDING_AXIS_REGISTRY_VERSION_V1,
      readingRef: nativeReadingId, productResponseVersion: stable.responseVersion, engineVersion,
      readingDomain: 'general', sourceResponseHash: hash(stable), sourceSemanticHash: semanticHash,
      groundingHash: 'd'.repeat(64), units, disclosures: [], ambiguities: [],
    },
    semanticSource: {
      version: 'myeongha-official-reading-semantic-source-handoff-v1',
      semanticHash, snapshotId, officialReportHash: 'e'.repeat(64),
      units: units.map((unit, index) => ({
        unitId: unit.sourceCanonicalUnitRefs[0], sourceRefs: [],
        factRefs: [`temporal.segmentsById.${index === 0 ? 'before_jeol' : 'after_jeol'}.monthlyStemTenGod`],
      })),
    },
    temporal: {
      calendar: {
        version: 'myeonghwa-temporal-reader-evidence-v1', scope: 'monthly',
        intervalConvention: 'half_open_start_inclusive_end_exclusive',
        referenceDateTime, timeZone: 'Asia/Seoul', targetYear: 2026, targetMonth: 11, snapshotId,
        responseBodyHash: hash(response), calculationHash: 'f'.repeat(64),
        boundary: { at: referenceDateTime }, referenceSegmentId: 'after_jeol',
        segments: [
          { id: 'before_jeol', startsAt: '2026-10-31T15:00:00.000Z', endsAt: referenceDateTime,
            pillar: { stem: '무', branch: '술' }, stemTenGod: '정인', natalBranchRelations: {} },
          { id: 'after_jeol', startsAt: referenceDateTime, endsAt: '2026-11-30T15:00:00.000Z',
            pillar: { stem: '기', branch: '해' }, stemTenGod: '편인', natalBranchRelations: {} },
        ],
        dayunOverlap: { status: 'unavailable' } as
          { status: 'unavailable'; reasonCode?: string } |
          { status: 'resolved'; contextId: string; segments: Array<{
            index: number; startsAt: string; endsAt: string; pillar: { stem: string; branch: string };
          }> },
      },
      unitWindows: units.map((unit, index) => ({
        unitId: unit.unitId, segmentIds: [index === 0 ? 'before_jeol' : 'after_jeol'],
      })),
    },
  };
  const trust = {
    authorityHash: '1'.repeat(64), issuer: 'isolated-saju', audience: 'isolated-myeongha',
    keyId: 'isolated-key', verificationKey: publicKey,
  };
  async function exchange(source = readerSource) {
    const payload = {
      version: 'myeonghwa-production-reading-issue-proof-v1',
      authorityHash: trust.authorityHash, issuer: trust.issuer, audience: trust.audience, keyId: trust.keyId,
      executionAttemptId, externalRequestRef, releaseRef,
      requestBodyHash: hash(request), responseBodyHash: hash(response), readerSourceHash: hash(source),
      nativeReadingId, engineVersion, issuedAtMs: Date.now(),
    };
    const signature = sign(null, Buffer.from('myeongha/saju/production-reading-issue/v1\0' + hash(payload)),
      privateKey).toString('base64url');
    const { adapter, sourceVerifier } = createSajuProductionReadingIssueSourceV1({
      ...trust, baseUrl: 'https://isolated.example.test', bearerToken: 'isolated-synthetic-bearer',
      requireCanonicalReaderSource: true,
      async fetchImpl(_url, init) {
        expect(init.headers['x-myeongha-reader-source']).toBe('canonical-v1');
        return Response.json({ ...response, readerSource: source }, { headers: {
          'x-myeonghwa-product-reading-response-admitted': stable.responseVersion,
          'x-myeongha-saju-external-request-ref': externalRequestRef,
          'x-myeonghwa-production-issue-proof': Buffer.from(JSON.stringify({ payload, signature })).toString('base64url'),
        } });
      },
    });
    const attested = await adapter.requestPreparedReading!(request, {
      executionAttemptId, sourceBirthRevisionId, sourceBirthInputHash, releaseRef,
    });
    expect(attested.response).not.toHaveProperty('readerSource');
    return sourceVerifier.verifyProductionIssue({
      sourceResponse: attested.response, executedRequest: request, subjectId: randomUUID(),
      dbReadingId: readingId, readingSessionId: randomUUID(), sourceBirthRevisionId, executionAttemptId,
    });
  }
  return { referenceDateTime, readerSource, exchange, archive: {
    trusts: [trust], readingId, storedResponse, storedResponseHash,
  }, receipt: {
    acceptedAt: new Date().toISOString(), component: 'month', periodReferenceDateTime: referenceDateTime,
    nativeReadingId, executionAttemptId, sourceRequestHash: hash(request), releaseRef,
    externalRequestRef, engineVersion, storedResponseHash,
  } };
}

describe('signed canonical temporal issue', () => {
  it('preserves the exact purchase period through the archived Reader disclosure', async () => {
    const input = fixture();
    const issued = await input.exchange();
    expect(issued?.issueProof?.readerSource).toEqual(input.readerSource);
    const receipt = { ...input.receipt, proof: issued!.issueProof };
    const result = verifyArchivedSajuProductionIssueProofV1({ ...input.archive, receipt });
    const grounding = projectSajuCanonicalReaderGroundingV1(result!.readerSource!, {
      readingId: input.archive.readingId, storedResponseHash: input.archive.storedResponseHash, sajuDomain: 'general',
    });
    expect(grounding.disclosures).toHaveLength(2);
    expect(grounding.disclosures[1]?.text).toContain('18:52:00');
    expect(grounding.disclosures[1]?.text).toContain('기해');
    expect(grounding.units[1]?.requiredDisclosureRefs).toEqual([grounding.disclosures[1]?.disclosureRef]);
    expect(verifyArchivedSajuProductionIssueProofV1({
      ...input.archive, receipt: { ...receipt, periodReferenceDateTime: '2026-12-01T00:00:00.000Z' },
    })).toBeNull();
  });

  it('holds signed material with an uncovered or shifted segment', async () => {
    const input = fixture();
    const missing = structuredClone(input.readerSource);
    missing.temporal.unitWindows.pop();
    expect(await input.exchange(missing)).toBeNull();
    const shifted = structuredClone(input.readerSource);
    shifted.temporal.calendar.segments[1]!.startsAt = '2026-11-07T10:00:00.000Z';
    expect(await input.exchange(shifted)).toBeNull();
    const swapped = structuredClone(input.readerSource);
    swapped.temporal.unitWindows.reverse();
    swapped.temporal.unitWindows[0]!.unitId = input.readerSource.temporal.unitWindows[0]!.unitId;
    swapped.temporal.unitWindows[1]!.unitId = input.readerSource.temporal.unitWindows[1]!.unitId;
    expect(await input.exchange(swapped)).toBeNull();
  });

  it('projects each signed daeyun interval only into its corresponding Reader windows', async () => {
    const input = fixture();
    const source = structuredClone(input.readerSource);
    const segments = source.temporal.calendar.segments.map(({ startsAt, endsAt, pillar }, index) => ({
      index, startsAt, endsAt, pillar,
    }));
    const marked = {
      ...source,
      temporal: { ...source.temporal, calendar: {
        ...source.temporal.calendar, dayunDisclosureVersion: 'calculated_overlap_v1',
        dayunOverlap: { status: 'resolved' as const, contextId: 'dayun_temporal_' + 'a'.repeat(24), segments },
      } },
    };
    const issued = await input.exchange(marked);
    expect(issued?.issueProof?.readerSource).toEqual(marked);
    const project = (issue: NonNullable<typeof issued>) => {
      const result = verifyArchivedSajuProductionIssueProofV1({
        ...input.archive, receipt: { ...input.receipt, proof: issue.issueProof },
      });
      return projectSajuCanonicalReaderGroundingV1(result!.readerSource!, {
        readingId: input.archive.readingId, storedResponseHash: input.archive.storedResponseHash, sajuDomain: 'general',
      });
    };
    const grounded = project(issued!);
    expect(grounded.disclosures).toHaveLength(4);
    for (const index of [0, 1]) {
      expect(grounded.disclosures[index + 2]?.text).toContain('이 기간에 겹치는 대운은');
      expect(grounded.units[index]?.requiredDisclosureRefs).toEqual([
        grounded.disclosures[index]?.disclosureRef, grounded.disclosures[index + 2]?.disclosureRef,
      ]);
    }
    const unavailable = { ...marked, temporal: { ...marked.temporal, calendar: {
      ...marked.temporal.calendar, dayunOverlap: {
        status: 'unavailable' as const, reasonCode: 'birth_clock_time_unavailable',
      },
    } } };
    const withGap = project((await input.exchange(unavailable))!);
    expect(withGap.disclosures[2]?.text).toContain('대운을 계산할 근거가 부족');
    expect(withGap.units.every(unit => unit.requiredDisclosureRefs.includes(withGap.disclosures[2]!.disclosureRef)))
      .toBe(true);
    segments[0]!.startsAt = '2026-10-30T15:00:00.000Z';
    expect(await input.exchange(marked)).toBeNull();
  });
});
