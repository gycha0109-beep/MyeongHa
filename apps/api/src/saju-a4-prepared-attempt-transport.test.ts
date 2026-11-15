import { describe, expect, it } from "vitest";
import {
  createSajuProductionReadingHttpAdapterV1,
  createSajuPreviewReadingHttpAdapterV1,
  SAJU_A4_PREPARED_ATTEMPT_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1,
  SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
} from "./saju-production-reading-http-adapter.js";

const ATTEMPT = "123e4567-e89b-42d3-a456-426614174002";
const request = Object.freeze({
  birth: { calendarType: "solar" as const, date: "1995-01-04", time: null },
  reading: { text: "오늘의 운세" },
});
const payload = {
  responseVersion: SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
  state: "temporarily_unavailable",
};

function fixture(preview = false) {
  const observed: Array<{
    url: string;
    headers: Record<string, string>;
    body: string;
  }> = [];
  const fetchImpl = async (
    url: string,
    init: {
      headers: Record<string, string>;
      body: string;
    },
  ) => {
    observed.push({ url, headers: init.headers, body: init.body });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json",
        [SAJU_PRODUCT_READING_RESPONSE_ADMISSION_HEADER_V1]:
          SAJU_PRODUCT_READING_RESPONSE_ADMISSION_VERSION_V1,
        ...(preview ? { "x-myeonghwa-reading-lifecycle": "preview" } : {}),
      },
    });
  };
  const config = {
    baseUrl: "https://private-saju.example.test",
    bearerToken: "server-only-example-token",
    fetchImpl,
  };
  return {
    observed,
    adapter: preview
      ? createSajuPreviewReadingHttpAdapterV1(config)
      : createSajuProductionReadingHttpAdapterV1(config),
  };
}

describe("A4 official source prepared attempt coordinate transport", () => {
  it("adds one server-only attempt ID header to the production reading request, never to the body", async () => {
    const x = fixture();
    await expect(
      x.adapter.requestReading(request, { executionAttemptId: ATTEMPT }),
    ).resolves.toEqual(payload);
    expect(x.observed).toHaveLength(1);
    expect(x.observed[0]?.url).toBe(
      "https://private-saju.example.test/api/readings",
    );
    expect(x.observed[0]?.headers[SAJU_A4_PREPARED_ATTEMPT_HEADER_V1]).toBe(
      ATTEMPT,
    );
    expect(x.observed[0]?.headers.authorization).toBe(
      "Bearer server-only-example-token",
    );
    expect(JSON.parse(x.observed[0]!.body)).toEqual(request);
    expect(x.observed[0]?.body).not.toContain(ATTEMPT);
  });

  it("preserves existing production requests without an A4 attempt header", async () => {
    const x = fixture();
    await x.adapter.requestReading(request);
    expect(x.observed).toHaveLength(1);
    expect(
      x.observed[0]?.headers[SAJU_A4_PREPARED_ATTEMPT_HEADER_V1],
    ).toBeUndefined();
  });

  it("rejects untrusted attempt identifiers without any provider transport", async () => {
    const x = fixture();
    for (const id of [
      "browser-attempt",
      "",
      ATTEMPT + "\n",
      "0".repeat(300),
      "123e4567-e89b-42d3-a456-426614174003;DROP TABLE x",
    ]) {
      await expect(
        x.adapter.requestReading(request, { executionAttemptId: id }),
      ).rejects.toMatchObject({ code: "INVALID_READING_REQUEST" });
    }
    expect(x.observed).toHaveLength(0);
  });

  it("rejects A4 attempt metadata on the Preview route before sending a request", async () => {
    const x = fixture(true);
    await expect(
      x.adapter.requestReading(request, { executionAttemptId: ATTEMPT }),
    ).rejects.toMatchObject({ code: "INVALID_READING_REQUEST" });
    expect(x.observed).toHaveLength(0);
  });
});
