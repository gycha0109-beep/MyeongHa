import { describe, expect, it, vi } from "vitest";
import {
  persistIssuedSajuOfficialReadingV1,
  type SajuOfficialCurrentAuthorityPortV1,
  type SajuOfficialDbMappingVerificationPortV1,
  type SajuOfficialImmutableCommitPortV1,
  type SajuOfficialSourceVerificationPortV1,
} from "../apps/api/src/saju-official-reading-issuer-db-persistence-v1.js";
import {
  executeAndPersistCurrentBirthSajuOfficialReadingV1,
  type SajuOfficialIssuedDbTransactionPortV1,
} from "../apps/api/src/saju-production-reading-execution.js";
import { hashSajuHeldSourceProofRequestV1 } from "../apps/api/src/saju-held-source-proof-verifier-v1.js";

const SUBJECT = "123e4567-e89b-42d3-a456-426614174000";
const READING = "123e4567-e89b-42d3-a456-426614174001";
const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const SESSION = "123e4567-e89b-42d3-a456-426614174003";
const OUTBOX = "123e4567-e89b-42d3-a456-426614174005";
const BIRTH_REVISION = "123e4567-e89b-42d3-a456-426614174006";
const REF = "saju_source_123e4567-e89b-42d3-a456-426614174004";
const WRONG_REF = "saju_source_123e4567-e89b-42d3-a456-426614174007";
const native = {
  responseVersion: "myeonghwa-product-reading-response-v2",
  responseId: "reading_response_0123456789abcdef01234567",
  state: "delivered",
  messageCode: "READING_DELIVERED",
  requiredAction: "none",
  reading: {
    readingId: "official_native_reading",
    sections: [
      {
        sectionType: "personality",
        state: "complete",
        title: "성향",
        blocks: [
          { type: "paragraph", text: "독립적으로 검증된 원본만 보존합니다." },
        ],
      },
    ],
    disclosures: [
      { type: "scope_limitation", text: "검증된 범위만 제공합니다." },
    ],
  },
};
const sourceHash = hashSajuHeldSourceProofRequestV1(native);
const sourceRequest = {
  birth: { calendarType: "solar" as const, date: "2001-07-14", time: "15:20" },
  reading: { text: "전체 사주" },
};

function fixture() {
  const sourceVerifier: SajuOfficialSourceVerificationPortV1 = {
    verifyProductionIssue: vi.fn(async () => ({
      state: "production_source_verified" as const,
      nativeReadingId: native.reading.readingId,
      sourceResponseHash: sourceHash,
      sourceBirthRevisionId: BIRTH_REVISION,
      sourceBirthInputHash: "sha256:v1:" + "b".repeat(64),
      engineVersion: "saju-engine-v1",
      externalRequestRef: REF,
    })),
  };
  const mappingVerifier: SajuOfficialDbMappingVerificationPortV1 = {
    verifyIssuedReadingMapping: vi.fn(async () => null),
  };
  const currentAuthority: SajuOfficialCurrentAuthorityPortV1 = {
    admitCurrentIssue: vi.fn(async () => true),
  };
  const commitPort: SajuOfficialImmutableCommitPortV1 = {
    finalizeSuccess: vi.fn(async () => {
      throw new Error("must not finalize without mapping");
    }),
  };
  return { sourceVerifier, mappingVerifier, currentAuthority, commitPort };
}
function preparedInput(p: ReturnType<typeof fixture>, ref?: string) {
  return {
    subjectId: SUBJECT,
    readingId: READING,
    readingSessionId: SESSION,
    executionAttemptId: ATTEMPT,
    outboxEventId: OUTBOX,
    sourceBirthRevisionId: BIRTH_REVISION,
    sourceResponse: native,
    executedRequest: sourceRequest,
    ...(ref === undefined ? {} : { authenticatedTransportSourceRef: ref }),
    ...p,
  };
}

describe("A4 authenticated ref must equal independently verified Saju source before DB finalization", () => {
  it("rejects authenticated transport ref substitution before DB mapping and writes", async () => {
    const p = fixture();
    const result = await persistIssuedSajuOfficialReadingV1(
      preparedInput(p, WRONG_REF),
    );
    expect(result).toMatchObject({
      state: "held",
      reason: "production_source_unverified",
    });
    expect(p.mappingVerifier.verifyIssuedReadingMapping).not.toHaveBeenCalled();
    expect(p.currentAuthority.admitCurrentIssue).not.toHaveBeenCalled();
    expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("only advances to the independently gated DB mapping when the exact Saju ref agrees", async () => {
    const p = fixture();
    const result = await persistIssuedSajuOfficialReadingV1(
      preparedInput(p, REF),
    );
    expect(result).toMatchObject({
      state: "held",
      reason: "db_mapping_unverified",
    });
    expect(p.mappingVerifier.verifyIssuedReadingMapping).toHaveBeenCalledTimes(
      1,
    );
    expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
  });

  it("never accepts malformed, user-like or unrelated transport source refs", async () => {
    for (const ref of [
      "some-client-value",
      "",
      "saju_source_" + ATTEMPT + ";bad",
    ]) {
      const p = fixture();
      const result = await persistIssuedSajuOfficialReadingV1(
        preparedInput(p, ref),
      );
      expect(result).toMatchObject({
        state: "held",
        reason: "production_source_unverified",
      });
      expect(
        p.mappingVerifier.verifyIssuedReadingMapping,
      ).not.toHaveBeenCalled();
    }
  });

  it("passes the actual source HTTP header into the immutable issuer verification after DB prepare", async () => {
    const p = fixture();
    const requestReading = vi.fn(async () => {
      throw new Error("legacy transport must not run");
    });
    const requestReadingWithSourceRef = vi.fn(async () => ({
      response: native,
      externalRequestRef: WRONG_REF,
    }));
    const dbTransaction: SajuOfficialIssuedDbTransactionPortV1 = {
      run: async ({ commit }) =>
        commit({
          currentAuthority: p.currentAuthority,
          commitPort: p.commitPort,
        }),
    };
    const result = await executeAndPersistCurrentBirthSajuOfficialReadingV1({
      profile: {
        birthProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        profileKind: "self",
        label: null,
        archivedAt: null,
        currentRevision: {
          revisionId: BIRTH_REVISION,
          revisionNo: 3,
          input: {
            calendarType: "solar",
            birthDate: "2001-07-14",
            birthTime: "15:20:00",
            timeKnown: true,
            isLeapMonth: false,
            sex: "female",
          },
        },
        revisions: [
          { revisionId: BIRTH_REVISION, revisionNo: 3, isCurrent: true },
        ],
      },
      readingText: "전체 사주",
      adapter: { requestReading, requestReadingWithSourceRef },
      subjectId: SUBJECT,
      readingId: READING,
      readingSessionId: SESSION,
      executionAttemptId: ATTEMPT,
      outboxEventId: OUTBOX,
      sourceBirthRevisionId: BIRTH_REVISION,
      sourceVerifier: p.sourceVerifier,
      mappingVerifier: p.mappingVerifier,
      attemptPrepare: { prepareBeforeSourceCall: async () => true },
      dbTransaction,
    });
    expect(result).toMatchObject({
      state: "held",
      reason: "production_source_unverified",
    });
    expect(requestReading).not.toHaveBeenCalled();
    expect(requestReadingWithSourceRef).toHaveBeenCalledWith(
      expect.any(Object),
      { executionAttemptId: ATTEMPT },
    );
    expect(p.commitPort.finalizeSuccess).not.toHaveBeenCalled();
  });
});
