import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
} from '../../../packages/domain/src/index.js';

export const API_FOUNDATION_VERSION = 'myeongha-api-foundation-v0.3' as const;

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

export {
  ApiCommandError,
  prepareChatReceiveCommand,
  type ChatReceivePlan,
  type PrepareChatReceiveInput,
  type TrustedThreadBinding,
} from './chat-receive.js';

export {
  CharacterChatTurnOrchestrationError,
  InMemoryCharacterChatCommitPortV1,
  runMockCharacterChatTurn,
  StaticMockCharacterRendererProviderV1,
  type CharacterChatCommitPortV1,
  type CharacterChatCommitReceiptV1,
  type CharacterCommittedTurnV1,
  type CharacterRendererProviderInputV1,
  type CharacterRendererProviderPortV1,
  type CharacterRuntimeContextAssemblyInputV1,
  type MockCharacterChatTurnResultV1,
  type RunMockCharacterChatTurnInputV1,
} from './character-chat-orchestration.js';
