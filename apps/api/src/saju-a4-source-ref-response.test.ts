import { describe, expect, it } from "vitest";
import {
  createSajuProductionReadingHttpAdapterV1,
  createSajuPreviewReadingHttpAdapterV1,
  SAJU_A4_SOURCE_REF_RESPONSE_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
} from "./saju-production-reading-http-adapter.js";

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const REF_A = "saju_source_123e4567-e89b-42d3-a456-426614174004";
const REF_B = "saju_source_123e4567-e89b-42d3-a456-426614174005";
const payload = {
  responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
  state: "temporarily_unavailable",
};
const request = (text: string) => ({
  birth: { calendarType: "solar" as const, date: "1995-03-03", time: null },
  reading: { text },
});
const prepared = { executionAttemptId: ATTEMPT };

function fixture(sourceRef: (text: string) => string | null) {
  const sent: Array<{ body: unknown; headers: Record<string, string> }> = [];
  const adapter = createSajuProductionReadingHttpAdapterV1({
    baseUrl: "https://private-saju.example.test",
    bearerToken: "server-only",
    fetchImpl: async (_url, init) => {
      const parsed = JSON.parse(init.body) as ReturnType<typeof request>;
      sent.push({
        body: parsed,
        headers: init.headers as Record<string, string>,
      });
      const ref = sourceRef(parsed.reading.text);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "content-type": "application/json",
          [SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1]:
            SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
          ...(ref === null
            ? {}
            : { [SAJU_A4_SOURCE_REF_RESPONSE_HEADER_V1]: ref }),
        },
      });
    },
  });
  return { adapter, sent };
}

describe("A4 authenticated Saju source ref response transport", () => {
  it("returns source ref separately from the product reading JSON", async () => {
    const x = fixture(() => REF_A);
    const result = await x.adapter.requestReadingWithSourceRef!(
      request("내 성향"),
      prepared,
    );
    expect(result).toEqual({ response: payload, externalRequestRef: REF_A });
    expect(x.sent).toHaveLength(1);
    expect(JSON.stringify(x.sent[0]?.body)).not.toContain(REF_A);
    expect(x.sent[0]?.headers["x-myeongha-reading-execution-attempt-id"]).toBe(
      ATTEMPT,
    );
  });

  it("refuses a missing, forged or malformed source ref before accepting reading output", async () => {
    for (const ref of [
      null,
      "",
      "browser-ref",
      "saju_source_" + ATTEMPT + ";sql",
    ]) {
      const x = fixture(() => ref);
      await expect(
        x.adapter.requestReadingWithSourceRef!(request("풀이"), prepared),
      ).rejects.toMatchObject({ code: "SOURCE_REF_ATTESTATION_REJECTED" });
    }
  });

  it("keeps concurrent authorized requests and their returned source refs isolated", async () => {
    const x = fixture((text) => (text === "A" ? REF_A : REF_B));
    const [a, b] = await Promise.all([
      x.adapter.requestReadingWithSourceRef!(request("A"), prepared),
      x.adapter.requestReadingWithSourceRef!(request("B"), prepared),
    ]);
    expect(a.externalRequestRef).toBe(REF_A);
    expect(b.externalRequestRef).toBe(REF_B);
  });

  it("rejects no prepared attempt before reaching provider transport", async () => {
    const x = fixture(() => REF_A);
    await expect(
      x.adapter.requestReadingWithSourceRef!(request("A"), undefined as never),
    ).rejects.toMatchObject({ code: "INVALID_READING_REQUEST" });
    expect(x.sent).toHaveLength(0);
  });

  it("does not add A4 source ref authority to ordinary or Preview calls", async () => {
    const x = fixture(() => null);
    await expect(x.adapter.requestReading(request("일반"))).resolves.toEqual(
      payload,
    );
    const preview = createSajuPreviewReadingHttpAdapterV1({
      baseUrl: "https://private-saju.example.test",
      bearerToken: "server-only",
    });
    expect(preview.requestReadingWithSourceRef).toBeUndefined();
  });
});
