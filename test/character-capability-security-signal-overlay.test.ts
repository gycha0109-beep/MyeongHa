import { describe, expect, it } from 'vitest';
import {
  evaluateCapabilityGate,
  evaluateCapabilitySecuritySignalsV1,
  type CapabilityGateInput,
  type CapabilitySecuritySignalV1,
} from '../packages/domain/src/capability-gate.js';

const base: CapabilityGateInput = Object.freeze({
  needsSaju: false,
  characterCapabilityAllowed: true,
  userConsentAllowed: true,
  sajuDomainAvailability: 'not_requested',
  worldStateAllowed: true,
  entitlementAllowed: true,
  contentPolicyAllowed: true,
  clientCapabilityAllowed: true,
});

describe('Capability Gate — orthogonal negative-only security signals', () => {
  it('retains the original capability result when no signal was supplied', () => {
    expect(evaluateCapabilityGate(base)).toEqual({
      allowed: true, sajuCoverage: 'none',
    });
    expect(evaluateCapabilityGate({...base, securitySignals: []})).toEqual({
      allowed: true, sajuCoverage: 'none',
    });
  });

  it.each([
    [['instruction_override_attempt'], 'SECURITY_INSTRUCTION_OVERRIDE_DENIED'],
    [['invalid_input'], 'SECURITY_INPUT_INVALID'],
    [['new_source_authority'], 'SAJU_NEW_SOURCE_AUTHORITY_REQUIRED'],
    [
      ['possible_self_harm', 'new_source_authority'],
      'SAJU_NEW_SOURCE_AUTHORITY_REQUIRED',
    ],
    [
      ['possible_threat', 'instruction_override_attempt'],
      'SECURITY_INSTRUCTION_OVERRIDE_DENIED',
    ],
  ] as const)('vetoes independently of ordinary/Saju intent: %s', (signals, reason) => {
    expect(evaluateCapabilityGate({...base, securitySignals: signals})).toEqual({
      allowed: false, reason,
    });
    expect(evaluateCapabilityGate({
      ...base,
      needsSaju: true,
      sajuDomainAvailability: 'available',
      securitySignals: signals,
    })).toEqual({allowed: false, reason});
  });

  it('defers ambiguous harm/threat/injection candidates to pre-existing content policy', () => {
    const signals: readonly CapabilitySecuritySignalV1[] = [
      'possible_self_harm', 'possible_threat', 'possible_prompt_injection',
    ];
    expect(evaluateCapabilitySecuritySignalsV1(signals)).toBe(null);
    expect(evaluateCapabilityGate({...base, securitySignals: signals})).toEqual({
      allowed: true, sajuCoverage: 'none',
    });
    expect(evaluateCapabilityGate({
      ...base, securitySignals: signals, contentPolicyAllowed: false,
    })).toEqual({allowed: false, reason: 'CONTENT_POLICY_DENIED'});
  });

  it('rejects unknown, duplicate and malformed signals instead of creating authority', () => {
    for (const signals of [
      ['allow_admin' as CapabilitySecuritySignalV1],
      ['possible_self_harm', 'possible_self_harm'] as CapabilitySecuritySignalV1[],
      [undefined] as unknown as CapabilitySecuritySignalV1[],
      null as unknown as CapabilitySecuritySignalV1[],
    ]) {
      expect(evaluateCapabilityGate({...base, securitySignals: signals})).toEqual({
        allowed: false, reason: 'SECURITY_SIGNAL_INVALID',
      });
    }
  });

  it('cannot override withdrawn consent, missing entitlement or content policy denial', () => {
    expect(evaluateCapabilityGate({
      ...base, userConsentAllowed: false, securitySignals: [],
    })).toEqual({allowed: false, reason: 'USER_CONSENT_DENIED'});
    expect(evaluateCapabilityGate({
      ...base, entitlementAllowed: false, securitySignals: ['possible_self_harm'],
    })).toEqual({allowed: false, reason: 'ENTITLEMENT_DENIED'});
    expect(evaluateCapabilityGate({
      ...base, contentPolicyAllowed: false, securitySignals: [],
    })).toEqual({allowed: false, reason: 'CONTENT_POLICY_DENIED'});
  });

  it('never converts an out-of-scope Saju request to a normal-chat entitlement', () => {
    expect(evaluateCapabilityGate({
      ...base,
      needsSaju: false,
      sajuDomainAvailability: 'not_requested',
      securitySignals: ['new_source_authority'],
    })).toEqual({allowed: false, reason: 'SAJU_NEW_SOURCE_AUTHORITY_REQUIRED'});
  });
});
