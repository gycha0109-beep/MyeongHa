export type SajuDomainAvailability =
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'not_requested';

export interface CapabilityGateInput {
  readonly needsSaju: boolean;
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
  | 'SAJU_DOMAIN_STATE_INVALID';

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
