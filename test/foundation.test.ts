import { describe, expect, it } from 'vitest';
import {
  ContractViolationError,
  parseChatStructuredActionV1,
  parseSajuDomain,
} from '../packages/contracts/src/index.js';
import {
  createImmutableArtifact,
  evaluateCapabilityGate,
  ImmutableArtifactRegistry,
  snapshotCurrentCharacterGrants,
} from '../packages/domain/src/index.js';

 describe('bounded contracts', () => {
  it('rejects unknown Saju domains instead of falling back', () => {
    expect(() => parseSajuDomain('career-but-invented')).toThrow(
      ContractViolationError,
    );
  });

  it('does not allow chat structured actions to become a mutation bus', () => {
    expect(() =>
      parseChatStructuredActionV1({
        type: 'ADVANCE_EPISODE',
        version: 'v1',
        episodeId: 'episode-1',
      }),
    ).toThrow(ContractViolationError);
  });

  it('rejects unknown fields in a valid action shape', () => {
    expect(() =>
      parseChatStructuredActionV1({
        type: 'SELECT_SAJU_DOMAIN',
        version: 'v1',
        domain: 'career',
        force: true,
      }),
    ).toThrow(ContractViolationError);
  });
});

describe('explicit grant snapshots', () => {
  it('freezes only the approval-time character set', () => {
    const current = ['char-003', 'char-001', 'char-001'];
    const grants = snapshotCurrentCharacterGrants(current);
    current.push('char-future');

    expect(grants).toEqual([
      { granteeCharacterId: 'char-001' },
      { granteeCharacterId: 'char-003' },
    ]);
  });
});

describe('immutable versioned registry', () => {
  it('resolves exact key/version and rejects unknown versions', () => {
    const artifact = createImmutableArtifact('relationship-policy', 'v1', {
      stages: ['first_meeting'],
    });
    const registry = new ImmutableArtifactRegistry([artifact]);

    expect(registry.resolve('relationship-policy', 'v1').contentHash).toBe(
      artifact.contentHash,
    );
    expect(() => registry.resolve('relationship-policy', 'v2')).toThrow(
      /Unknown immutable artifact/,
    );
  });

  it('rejects a forged content hash', () => {
    const artifact = createImmutableArtifact('usage-policy', 'v1', {
      maxRequests: 3,
    });

    expect(
      () =>
        new ImmutableArtifactRegistry([
          { ...artifact, contentHash: 'sha256:v1:forged' },
        ]),
    ).toThrow(/hash mismatch/);
  });
});

describe('capability gate', () => {
  const allowedBase = {
    needsSaju: true,
    characterCapabilityAllowed: true,
    userConsentAllowed: true,
    sajuDomainAvailability: 'available' as const,
    worldStateAllowed: true,
    entitlementAllowed: true,
    contentPolicyAllowed: true,
    clientCapabilityAllowed: true,
  };

  it('fails closed for unavailable Saju domains', () => {
    expect(
      evaluateCapabilityGate({
        ...allowedBase,
        sajuDomainAvailability: 'unavailable',
      }),
    ).toEqual({ allowed: false, reason: 'SAJU_DOMAIN_UNAVAILABLE' });
  });

  it('requires non-Saju turns to declare no Saju request state', () => {
    expect(
      evaluateCapabilityGate({
        ...allowedBase,
        needsSaju: false,
        sajuDomainAvailability: 'available',
      }),
    ).toEqual({ allowed: false, reason: 'SAJU_DOMAIN_STATE_INVALID' });
  });

  it('allows partial Saju capability without promoting it to full', () => {
    expect(
      evaluateCapabilityGate({
        ...allowedBase,
        sajuDomainAvailability: 'partial',
      }),
    ).toEqual({ allowed: true, sajuCoverage: 'partial' });
  });
});
