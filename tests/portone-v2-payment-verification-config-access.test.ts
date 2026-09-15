import { describe, expect, it } from 'vitest';
import {
  PortOneV2PaymentVerificationAdapterErrorV1,
  createPortOneV2PaymentVerificationAdapterV1,
  type PortOneV2PaymentHttpFetchV1,
  type PortOneV2PaymentVerificationAdapterConfigV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';

function throwingFetchCounter(): Readonly<{
  fetchImpl: PortOneV2PaymentHttpFetchV1;
  calls: () => number;
}> {
  let calls = 0;
  return Object.freeze({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('provider fetch must not run during construction');
    },
    calls: () => calls,
  });
}

function expectConfigAccessFailure(
  config: PortOneV2PaymentVerificationAdapterConfigV1,
  rawMarker: string,
): void {
  try {
    createPortOneV2PaymentVerificationAdapterV1(config);
    throw new Error('expected PortOne verification config access failure');
  } catch (error) {
    expect(error).toBeInstanceOf(PortOneV2PaymentVerificationAdapterErrorV1);
    expect(error).toMatchObject({
      name: 'PortOneV2PaymentVerificationAdapterErrorV1',
      code: 'INVALID_CONFIGURATION',
      httpStatus: null,
      message: 'PortOne V2 verification configuration could not be read.',
    });
    expect((error as Error).message).not.toContain(rawMarker);
  }
}

describe('PortOne V2 payment verification config access boundary', () => {
  it('maps a throwing required config accessor to generic INVALID_CONFIGURATION before provider work', () => {
    const marker = 'raw-api-secret-accessor-secret';
    const fetch = throwingFetchCounter();
    const config = {
      get apiSecret(): string {
        throw new Error(marker);
      },
      evidenceHmacSecret: 'h'.repeat(32),
      fetchImpl: fetch.fetchImpl,
    } as PortOneV2PaymentVerificationAdapterConfigV1;

    expectConfigAccessFailure(config, marker);
    expect(fetch.calls()).toBe(0);
  });

  it('maps a throwing optional runtime config accessor to the same generic boundary before provider work', () => {
    const marker = 'raw-now-config-accessor-secret';
    const fetch = throwingFetchCounter();
    const config = {
      apiSecret: 'test-portone-api-secret',
      evidenceHmacSecret: 'h'.repeat(32),
      fetchImpl: fetch.fetchImpl,
      get now(): () => Date {
        throw new Error(marker);
      },
    } as PortOneV2PaymentVerificationAdapterConfigV1;

    expectConfigAccessFailure(config, marker);
    expect(fetch.calls()).toBe(0);
  });

  it('preserves field-specific validation after a readable config snapshot', () => {
    const fetch = throwingFetchCounter();

    try {
      createPortOneV2PaymentVerificationAdapterV1({
        apiSecret: '   ',
        evidenceHmacSecret: 'h'.repeat(32),
        fetchImpl: fetch.fetchImpl,
      });
      throw new Error('expected invalid API credential');
    } catch (error) {
      expect(error).toBeInstanceOf(PortOneV2PaymentVerificationAdapterErrorV1);
      expect(error).toMatchObject({
        name: 'PortOneV2PaymentVerificationAdapterErrorV1',
        code: 'INVALID_CONFIGURATION',
        httpStatus: null,
        message: 'PortOne V2 API credential is invalid.',
      });
    }

    expect(fetch.calls()).toBe(0);
  });
});
