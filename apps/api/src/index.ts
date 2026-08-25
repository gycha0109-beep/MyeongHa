import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
} from '../../../packages/domain/src/index.js';

export const API_FOUNDATION_VERSION = 'myeongha-api-foundation-v0.2' as const;

export function authorizePlannedCapability(
  input: CapabilityGateInput,
): CapabilityGateResult {
  return evaluateCapabilityGate(input);
}

export {
  runMockFirstReadingTurn,
  type MockFirstReadingTurnInput,
  type MockFirstReadingTurnResult,
} from './vertical-slice.js';
