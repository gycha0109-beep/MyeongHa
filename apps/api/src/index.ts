import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
} from '../../../packages/domain/src/index.js';

export const API_FOUNDATION_VERSION = 'myeongha-api-foundation-v0.8' as const;

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

export {
  getCurrentSubjectProfile,
  patchCurrentSubjectProfile,
  SUBJECT_PROFILE_AUTHORITY_BINDINGS_V1,
  SubjectProfileAuthorityPortErrorV1,
  type CurrentSubjectKindV1,
  type CurrentSubjectProfileAuthorityRowV1,
  type CurrentSubjectProfileResponseV1,
  type CurrentSubjectStatusV1,
  type GetCurrentSubjectProfileInputV1,
  type PatchedProfileAuthorityRowV1,
  type PatchCurrentSubjectProfileInputV1,
  type ProfilePatchV1,
  type SubjectProfileAuthorityFailureCodeV1,
  type SubjectProfileAuthorityPortV1,
} from './subject-profile.js';

export {
  BIRTH_PROFILE_READ_AUTHORITY_BINDING_V1,
  BirthProfileReadAuthorityPortErrorV1,
  getBirthProfile,
  type BirthProfileCurrentRevisionAuthorityRowV1,
  type BirthProfileReadAuthorityFailureCodeV1,
  type BirthProfileReadAuthorityPortV1,
  type BirthProfileReadResponseV1,
  type GetBirthProfileInputV1,
} from './birth-profile-read.js';

export {
  getTargetPerson,
  listTargetPersons,
  TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1,
  TargetPersonReadAuthorityPortErrorV1,
  type GetTargetPersonInputV1,
  type ListTargetPersonsInputV1,
  type TargetPersonCurrentAuthorityRowV1,
  type TargetPersonReadAuthorityFailureCodeV1,
  type TargetPersonReadAuthorityPortV1,
  type TargetPersonReadResponseV1,
} from './target-person-read.js';

export {
  getMergeJob,
  MERGE_JOB_READ_AUTHORITY_BINDING_V1,
  MergeJobReadAuthorityPortErrorV1,
  type GetMergeJobInputV1,
  type MergeJobCurrentAuthorityRowV1,
  type MergeJobReadAuthorityFailureCodeV1,
  type MergeJobReadAuthorityPortV1,
  type MergeJobReadResponseV1,
} from './merge-job-read.js';

export {
  DATA_DELETION_JOB_READ_AUTHORITY_BINDING_V1,
  DataDeletionJobReadAuthorityPortErrorV1,
  getDataDeletionJob,
  type DataDeletionJobCurrentAuthorityRowV1,
  type DataDeletionJobReadAuthorityFailureCodeV1,
  type DataDeletionJobReadAuthorityPortV1,
  type DataDeletionJobReadResponseV1,
  type GetDataDeletionJobInputV1,
} from './data-deletion-job-read.js';

export {
  getNotificationPreferences,
  NOTIFICATION_PREFERENCE_READ_AUTHORITY_BINDINGS_V1,
  NotificationPreferenceReadAuthorityPortErrorV1,
  type GetNotificationPreferencesInputV1,
  type NotificationCategoryV1,
  type NotificationPreferenceAuthorityRowV1,
  type NotificationPreferenceReadAuthorityFailureCodeV1,
  type NotificationPreferenceReadAuthorityPortV1,
  type NotificationPreferenceReadItemV1,
  type NotificationPreferencesReadResponseV1,
  type NotificationPreviewModeV1,
  type NotificationSettingsAuthorityRowV1,
  type NotificationSettingsReadResponseV1,
} from './notification-preferences-read.js';
