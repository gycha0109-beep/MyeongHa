export type SajuDomainAvailability =
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'not_requested';

/**
 * Negative-only, server-observed signals. These labels never authorize a
 * capability, select a Saju source, or replace the existing Content Policy.
 * Possible harm/threat signals require the separately established content
 * policy decision; they are not blanket denials of supportive conversations.
 */
export type CapabilitySecuritySignalV1 =
  | 'instruction_override_attempt'
  | 'new_source_authority'
  | 'invalid_input'
  | 'possible_prompt_injection'
  | 'possible_self_harm'
  | 'possible_threat';

export type CapabilitySecurityVetoV1 =
  | 'SECURITY_SIGNAL_INVALID'
  | 'SECURITY_INPUT_INVALID'
  | 'SECURITY_INSTRUCTION_OVERRIDE_DENIED'
  | 'SAJU_NEW_SOURCE_AUTHORITY_REQUIRED';

const KNOWN_CAPABILITY_SECURITY_SIGNALS_V1: readonly CapabilitySecuritySignalV1[] =
  Object.freeze([
    'instruction_override_attempt',
    'new_source_authority',
    'invalid_input',
    'possible_prompt_injection',
    'possible_self_harm',
    'possible_threat',
  ]);

/** A signal can only remove permission; no value returned here grants it. */
export function evaluateCapabilitySecuritySignalsV1(
  signals: readonly CapabilitySecuritySignalV1[],
): CapabilitySecurityVetoV1 | null {
  if (!Array.isArray(signals) || signals.length > KNOWN_CAPABILITY_SECURITY_SIGNALS_V1.length) {
    return 'SECURITY_SIGNAL_INVALID';
  }
  const seen = new Set<CapabilitySecuritySignalV1>();
  for (const signal of signals) {
    if (!KNOWN_CAPABILITY_SECURITY_SIGNALS_V1.includes(signal) || seen.has(signal)) {
      return 'SECURITY_SIGNAL_INVALID';
    }
    seen.add(signal);
  }
  if (seen.has('invalid_input')) return 'SECURITY_INPUT_INVALID';
  if (seen.has('instruction_override_attempt')) {
    return 'SECURITY_INSTRUCTION_OVERRIDE_DENIED';
  }
  if (seen.has('new_source_authority')) return 'SAJU_NEW_SOURCE_AUTHORITY_REQUIRED';
  return null;
}

export interface CapabilityGateInput {
  readonly needsSaju: boolean;
  /** Optional negative-only signals issued by server scope/safety inspection. */
  readonly securitySignals?: readonly CapabilitySecuritySignalV1[];
  readonly characterCapabilityAllowed: boolean;
  readonly userConsentAllowed: boolean;
  readonly sajuDomainAvailability: SajuDomainAvailability;
  readonly worldStateAllowed: boolean;
  readonly entitlementAllowed: boolean;
  readonly contentPolicyAllowed: boolean;
  readonly clientCapabilityAllowed: boolean;
}

export type CapabilityDenialReason =
  | 'USER_CONSENT_DENIED'
  | 'CLIENT_CAPABILITY_UNSUPPORTED'
  | 'CONTENT_POLICY_DENIED'
  | 'WORLD_STATE_DENIED'
  | 'ENTITLEMENT_DENIED'
  | 'SAJU_CHARACTER_CAPABILITY_DENIED'
  | 'SAJU_DOMAIN_UNAVAILABLE'
  | 'SAJU_DOMAIN_STATE_INVALID'
  | CapabilitySecurityVetoV1;

export type CapabilityGateResult =
  | { readonly allowed: true; readonly sajuCoverage: 'none' | 'full' | 'partial' }
  | { readonly allowed: false; readonly reason: CapabilityDenialReason };

export function evaluateCapabilityGate(
  input: CapabilityGateInput,
): CapabilityGateResult {
  if (!input.userConsentAllowed) {
    return { allowed: false, reason: 'USER_CONSENT_DENIED' };
  }
  if (!input.clientCapabilityAllowed) {
    return { allowed: false, reason: 'CLIENT_CAPABILITY_UNSUPPORTED' };
  }
  if (!input.contentPolicyAllowed) {
    return { allowed: false, reason: 'CONTENT_POLICY_DENIED' };
  }
  if (!input.worldStateAllowed) {
    return { allowed: false, reason: 'WORLD_STATE_DENIED' };
  }
  if (!input.entitlementAllowed) {
    return { allowed: false, reason: 'ENTITLEMENT_DENIED' };
  }

  const securityVeto = evaluateCapabilitySecuritySignalsV1(
    input.securitySignals === undefined ? [] : input.securitySignals,
  );
  if (securityVeto !== null) {
    return { allowed: false, reason: securityVeto };
  }

  if (!input.needsSaju) {
    if (input.sajuDomainAvailability !== 'not_requested') {
      return { allowed: false, reason: 'SAJU_DOMAIN_STATE_INVALID' };
    }
    return { allowed: true, sajuCoverage: 'none' };
  }

  if (!input.characterCapabilityAllowed) {
    return { allowed: false, reason: 'SAJU_CHARACTER_CAPABILITY_DENIED' };
  }
  if (input.sajuDomainAvailability === 'unavailable') {
    return { allowed: false, reason: 'SAJU_DOMAIN_UNAVAILABLE' };
  }
  if (input.sajuDomainAvailability === 'not_requested') {
    return { allowed: false, reason: 'SAJU_DOMAIN_STATE_INVALID' };
  }
  return {
    allowed: true,
    sajuCoverage:
      input.sajuDomainAvailability === 'partial' ? 'partial' : 'full',
  };
}
