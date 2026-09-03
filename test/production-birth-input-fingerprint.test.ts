import { describe, expect, it } from 'vitest';
import type { BirthInputV1 } from '../apps/api/src/birth-profile-create-command.js';
import {
  PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1,
  canonicalizeProductionBirthInputV1,
  createProductionBirthInputFingerprintPortV1,
  fingerprintProductionBirthInputV1,
  requireProductionBirthInputHmacK1SecretV1,
} from '../apps/api/src/production-birth-input-fingerprint.js';
import { parseProductionBirthProfileCreateRuntimeConfigV1 } from '../apps/api/src/production-birth-profile-create-runtime-config.js';

const SECRET = 'test-birth-input-hmac-k1-secret-0123456789abcdef';
const SOLAR_INPUT: BirthInputV1 = Object.freeze({
  calendarType: 'solar',
  birthDate: '1996-01-09',
  birthTime: '09:30',
  timeKnown: true,
  isLeapMonth: false,
  sex: 'male',
});

describe('production Birth input fingerprint V1', () => {
  it('pins the separate server-only binding and deterministic canonical bytes', () => {
    expect(PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1).toEqual({
      scheme: 'hmac-sha256',
      keyVersion: 'k1',
      domain: 'myeongha.birth-input.v1',
      secretEnvName: 'MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET',
      minimumSecretBytes: 32,
    });
    expect(canonicalizeProductionBirthInputV1(SOLAR_INPUT)).toBe(
      '["solar","1996-01-09","09:30",true,false,"male"]',
    );
  });

  it('pins an exact HMAC-SHA-256 vector and version-prefixed storage format', () => {
    expect(
      fingerprintProductionBirthInputV1({
        birthInput: SOLAR_INPUT,
        secret: SECRET,
      }),
    ).toBe(
      'hmac-sha256:k1:940f5cb5920e31f6df0493cba4305e0ba073526bd1e3a91d95e7ec927bec1294',
    );
  });

  it('keeps null, boolean, time, and sex distinctions in the fingerprint material', () => {
    const variants: BirthInputV1[] = [
      SOLAR_INPUT,
      { ...SOLAR_INPUT, birthTime: '09:31' },
      { ...SOLAR_INPUT, sex: 'female' },
      {
        ...SOLAR_INPUT,
        birthTime: null,
        timeKnown: false,
      },
      {
        calendarType: 'lunar',
        birthDate: '1996-01-09',
        birthTime: '09:30',
        timeKnown: true,
        isLeapMonth: null,
        sex: 'male',
      },
      {
        calendarType: 'lunar',
        birthDate: '1996-01-09',
        birthTime: '09:30',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'male',
      },
    ];

    const fingerprints = variants.map((birthInput) =>
      fingerprintProductionBirthInputV1({ birthInput, secret: SECRET }),
    );
    expect(new Set(fingerprints).size).toBe(variants.length);
  });

  it('never embeds raw Birth values or the HMAC secret in the stored fingerprint', () => {
    const fingerprint = fingerprintProductionBirthInputV1({
      birthInput: SOLAR_INPUT,
      secret: SECRET,
    });

    expect(fingerprint).toMatch(/^hmac-sha256:k1:[0-9a-f]{64}$/u);
    expect(fingerprint).not.toContain('1996-01-09');
    expect(fingerprint).not.toContain('09:30');
    expect(fingerprint).not.toContain(SECRET);
  });

  it('fails closed on missing or undersized secrets', () => {
    expect(() => requireProductionBirthInputHmacK1SecretV1(undefined)).toThrow(
      'missing or too short',
    );
    expect(() => requireProductionBirthInputHmacK1SecretV1('x'.repeat(31))).toThrow(
      'missing or too short',
    );
    expect(requireProductionBirthInputHmacK1SecretV1('x'.repeat(32))).toBe(
      'x'.repeat(32),
    );
  });

  it('builds the command fingerprint port only from trusted server config', async () => {
    const config = parseProductionBirthProfileCreateRuntimeConfigV1({
      MYEONGHA_BIRTH_INPUT_HMAC_K1_SECRET: SECRET,
    });
    const port = createProductionBirthInputFingerprintPortV1(
      config.birthInputHmacK1Secret,
    );

    expect(await port.fingerprintBirthInput(SOLAR_INPUT)).toBe(
      'hmac-sha256:k1:940f5cb5920e31f6df0493cba4305e0ba073526bd1e3a91d95e7ec927bec1294',
    );
    expect(() => parseProductionBirthProfileCreateRuntimeConfigV1({})).toThrow(
      'missing or too short',
    );
  });

  it('does not reuse the Guest bearer fingerprint binding', () => {
    const serialized = JSON.stringify(PRODUCTION_BIRTH_INPUT_FINGERPRINT_BINDING_V1);
    expect(serialized).not.toContain('guest');
    expect(serialized).not.toContain('GUEST');
  });
});
