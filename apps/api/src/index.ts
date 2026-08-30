import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
} from '../../../packages/domain/src/index.js';

export const API_FOUNDATION_VERSION = 'myeongha-api-foundation-v0.17' as const;

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

export {
  markNotificationRead,
  NOTIFICATION_READ_COMMAND_AUTHORITY_BINDING_V1,
  NotificationReadCommandAuthorityPortErrorV1,
  type MarkNotificationReadInputV1,
  type MarkNotificationReadResponseV1,
  type NotificationReadCommandAuthorityFailureCodeV1,
  type NotificationReadCommandAuthorityPortV1,
  type NotificationReadCommandAuthorityRowV1,
} from './notification-read-command.js';

export {
  CHAT_THREAD_STREAM_READ_AUTHORITY_BINDING_V1,
  ChatThreadStreamReadAuthorityPortErrorV1,
  getChatThreadStream,
  type ChatThreadStreamAuthorityRowV1,
  type ChatThreadStreamMessageV1,
  type ChatThreadStreamReadAuthorityFailureCodeV1,
  type ChatThreadStreamReadAuthorityPortV1,
  type ChatThreadStreamReadResponseV1,
  type GetChatThreadStreamInputV1,
} from './chat-thread-stream-read.js';

export {
  getLifeRecordLedger,
  LIFE_RECORD_LEDGER_READ_AUTHORITY_BINDING_V1,
  LifeRecordLedgerReadAuthorityPortErrorV1,
  type GetLifeRecordLedgerInputV1,
  type LifeRecordLedgerAuthorityRowV1,
  type LifeRecordLedgerItemV1,
  type LifeRecordLedgerReadAuthorityFailureCodeV1,
  type LifeRecordLedgerReadAuthorityPortV1,
  type LifeRecordLedgerReadResponseV1,
} from './life-record-ledger-read.js';

export {
  getMemoryItems,
  MEMORY_ITEMS_READ_AUTHORITY_BINDING_V1,
  MemoryItemsReadAuthorityPortErrorV1,
  type GetMemoryItemsInputV1,
  type MemoryItemCurrentAuthorityRowV1,
  type MemoryItemReadItemV1,
  type MemoryItemsReadAuthorityFailureCodeV1,
  type MemoryItemsReadAuthorityPortV1,
  type MemoryItemsReadResponseV1,
} from './memory-items-read.js';

export {
  getMemoryGrants,
  MEMORY_GRANTS_READ_AUTHORITY_BINDING_V1,
  MemoryGrantsReadAuthorityPortErrorV1,
  type GetMemoryGrantsInputV1,
  type MemoryGrantCurrentAuthorityRowV1,
  type MemoryGrantReadItemV1,
  type MemoryGrantsReadAuthorityFailureCodeV1,
  type MemoryGrantsReadAuthorityPortV1,
  type MemoryGrantsReadResponseV1,
} from './memory-grants-read.js';

export {
  MEMORY_ITEM_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  MemoryItemRevokeCommandAuthorityPortErrorV1,
  revokeMemoryItem,
  type MemoryItemRevokeCommandAuthorityFailureCodeV1,
  type MemoryItemRevokeCommandAuthorityPortV1,
  type MemoryItemRevokeCommandAuthorityRowV1,
  type RevokeMemoryItemInputV1,
  type RevokeMemoryItemResponseV1,
} from './memory-item-revoke-command.js';

export {
  MEMORY_GRANT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  MemoryGrantRevokeCommandAuthorityPortErrorV1,
  revokeMemoryCharacterGrant,
  type MemoryGrantRevokeCommandAuthorityFailureCodeV1,
  type MemoryGrantRevokeCommandAuthorityPortV1,
  type MemoryGrantRevokeCommandAuthorityRowV1,
  type RevokeMemoryCharacterGrantInputV1,
  type RevokeMemoryCharacterGrantResponseV1,
} from './memory-grant-revoke-command.js';

export {
  LIFE_FACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  LifeFactRevokeCommandAuthorityPortErrorV1,
  revokeLifeFact,
  type LifeFactRevokeCommandAuthorityFailureCodeV1,
  type LifeFactRevokeCommandAuthorityPortV1,
  type LifeFactRevokeCommandAuthorityRowV1,
  type RevokeLifeFactInputV1,
  type RevokeLifeFactResponseV1,
} from './life-fact-revoke-command.js';

export {
  CHARACTER_FORGET_COMMAND_AUTHORITY_BINDING_V1,
  CharacterForgetCommandAuthorityPortErrorV1,
  forgetCharacter,
  type CharacterForgetCommandAuthorityFailureCodeV1,
  type CharacterForgetCommandAuthorityPortV1,
  type CharacterForgetCommandAuthorityRowV1,
  type ForgetCharacterInputV1,
  type ForgetCharacterResponseV1,
} from './character-forget-command.js';
