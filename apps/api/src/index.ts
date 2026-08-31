import {
  evaluateCapabilityGate,
  type CapabilityGateInput,
  type CapabilityGateResult,
} from '../../../packages/domain/src/index.js';

export const API_FOUNDATION_VERSION = 'myeongha-api-foundation-v0.35' as const;

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

export {
  CHARACTER_RELATIONSHIP_READ_AUTHORITY_BINDING_V1,
  CharacterRelationshipReadAuthorityPortErrorV1,
  getCharacterRelationship,
  type CharacterRelationshipCurrentAuthorityRowV1,
  type CharacterRelationshipReadAuthorityFailureCodeV1,
  type CharacterRelationshipReadAuthorityPortV1,
  type CharacterRelationshipReadItemV1,
  type CharacterRelationshipReadResponseV1,
  type GetCharacterRelationshipInputV1,
} from './character-relationship-read.js';

export {
  ENTITLEMENTS_READ_AUTHORITY_BINDING_V1,
  EntitlementsReadAuthorityPortErrorV1,
  getEntitlements,
  type EntitlementCurrentAuthorityRowV1,
  type EntitlementProjectionStatusV1,
  type EntitlementReadItemV1,
  type EntitlementsReadAuthorityFailureCodeV1,
  type EntitlementsReadAuthorityPortV1,
  type EntitlementsReadClockV1,
  type EntitlementsReadResponseV1,
  type GetEntitlementsInputV1,
} from './entitlements-read.js';

export {
  ACCOUNT_DELETION_START_AUTHORITY_BINDING_V1,
  AccountDeletionStartAuthorityPortErrorV1,
  startAccountDeletion,
  type AccountDeletionCommandIdPortV1,
  type AccountDeletionJobStatusV1,
  type AccountDeletionReauthenticationPortV1,
  type AccountDeletionStartAuthorityFailureCodeV1,
  type AccountDeletionStartAuthorityPortV1,
  type AccountDeletionStartAuthorityRowV1,
  type StartAccountDeletionInputV1,
  type StartAccountDeletionResponseV1,
} from './account-deletion-start-command.js';

export {
  GUEST_PROMOTION_AUTHORITY_BINDING_V1,
  GuestPromotionAuthorityPortErrorV1,
  promoteGuestToMember,
  type GuestPromotionAuthIdentityPortV1,
  type GuestPromotionAuthorityFailureCodeV1,
  type GuestPromotionAuthorityPortV1,
  type GuestPromotionAuthorityRowV1,
  type GuestPromotionGuestProofPortV1,
  type PromoteGuestInputV1,
  type PromoteGuestResponseV1,
  type VerifiedGuestPromotionAuthIdentityV1,
  type VerifiedGuestPromotionProofV1,
} from './guest-promotion-command.js';

export {
  SHARE_ARTIFACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  ShareArtifactRevokeCommandAuthorityPortErrorV1,
  revokeShareArtifact,
  type RevokeShareArtifactInputV1,
  type RevokeShareArtifactResponseV1,
  type ShareArtifactEffectiveStatusV1,
  type ShareArtifactRevokeCommandAuthorityFailureCodeV1,
  type ShareArtifactRevokeCommandAuthorityPortV1,
  type ShareArtifactRevokeCommandAuthorityRowV1,
} from './share-artifact-revoke-command.js';

export {
  PUBLIC_SHARE_READ_AUTHORITY_BINDING_V1,
  PublicShareReadAuthorityPortErrorV1,
  getPublicShareArtifact,
  type GetPublicShareArtifactInputV1,
  type PublicShareArtifactAuthorityRowV1,
  type PublicShareArtifactResponseV1,
  type PublicShareReadAuthorityFailureCodeV1,
  type PublicShareReadAuthorityPortV1,
  type PublicShareTokenFingerprintPortV1,
} from './public-share-read.js';

export {
  GUEST_BOOTSTRAP_AUTHORITY_BINDING_V1,
  GuestBootstrapAuthorityPortErrorV1,
  bootstrapSession,
  type BootstrapSessionInputV1,
  type BootstrapSessionResponseV1,
  type GuestBootstrapAuthorityFailureCodeV1,
  type GuestBootstrapAuthorityPortV1,
  type GuestBootstrapAuthorityRowV1,
  type GuestBootstrapCredentialIssuerPortV1,
  type GuestBootstrapIdentityResolverPortV1,
  type GuestBootstrapTokenFingerprintPortV1,
  type IssuedGuestBootstrapCredentialV1,
  type ReusableBootstrapIdentityV1,
  type ReusableGuestBootstrapIdentityV1,
  type ReusableMemberBootstrapIdentityV1,
} from './guest-bootstrap-command.js';

export {
  CHAT_TURN_ABANDON_AUTHORITY_BINDING_V1,
  ChatTurnAbandonAuthorityPortErrorV1,
  abandonChatTurn,
  type AbandonChatTurnInputV1,
  type AbandonChatTurnResponseV1,
  type ChatTurnAbandonAuthorityFailureCodeV1,
  type ChatTurnAbandonAuthorityPortV1,
} from './chat-turn-abandon-command.js';

export {
  CHAT_TURN_RETRY_AUTHORITY_BINDING_V1,
  ChatTurnRetryAuthorityPortErrorV1,
  retryChatTurn,
  type ChatTurnRetryAuthorityFailureCodeV1,
  type ChatTurnRetryAuthorityPortV1,
  type ChatTurnRetryAuthorityRowV1,
  type ChatTurnRetryExecutionMetadataPortV1,
  type RetryChatTurnInputV1,
  type RetryChatTurnResponseV1,
} from './chat-turn-retry-command.js';

export {
  PURCHASE_INTENT_CREATE_AUTHORITY_BINDING_V1,
  PurchaseIntentCreateAuthorityPortErrorV1,
  createPurchaseIntent,
  type CreatePurchaseIntentInputV1,
  type CreatePurchaseIntentResponseV1,
  type PurchaseIntentCreateAuthorityFailureCodeV1,
  type PurchaseIntentCreateAuthorityPortV1,
  type PurchaseIntentCreateAuthorityRowV1,
  type PurchaseIntentCreateRequestV1,
  type PurchaseIntentIdPortV1,
  type PurchaseIntentOfferSnapshotPortV1,
  type PurchaseIntentOfferSnapshotV1,
  type PurchaseIntentPlatformV1,
  type PurchaseIntentStatusV1,
} from './purchase-intent-create-command.js';

export {
  BIRTH_PROFILE_CREATE_AUTHORITY_BINDING_V1,
  BirthProfileCreateAuthorityPortErrorV1,
  createBirthProfile,
  type BirthCalendarTypeV1,
  type BirthInputFingerprintPortV1,
  type BirthInputV1,
  type BirthProfileCreateAuthorityFailureCodeV1,
  type BirthProfileCreateAuthorityPortV1,
  type BirthProfileCreateAuthorityRowV1,
  type BirthProfileCreateIdPortV1,
  type BirthProfileCreateRequestV1,
  type BirthSexV1,
  type CreateBirthProfileInputV1,
  type CreateBirthProfileResponseV1,
} from './birth-profile-create-command.js';

export {
  BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1,
  BirthProfileRevisionAppendAuthorityPortErrorV1,
  appendBirthProfileRevision,
  type AppendBirthProfileRevisionInputV1,
  type AppendBirthProfileRevisionResponseV1,
  type BirthProfileRevisionAppendAuthorityFailureCodeV1,
  type BirthProfileRevisionAppendAuthorityPortV1,
  type BirthProfileRevisionAppendAuthorityRowV1,
  type BirthProfileRevisionAppendIdPortV1,
  type BirthProfileRevisionAppendRequestV1,
} from './birth-profile-revision-append-command.js';

export {
  TARGET_PERSON_CREATE_AUTHORITY_BINDING_V1,
  TargetPersonCreateAuthorityPortErrorV1,
  createTargetPerson,
  type CreateTargetPersonInputV1,
  type CreateTargetPersonResponseV1,
  type TargetPersonCreateAuthorityFailureCodeV1,
  type TargetPersonCreateAuthorityPortV1,
  type TargetPersonCreateAuthorityRowV1,
  type TargetPersonCreateIdPortV1,
  type TargetPersonCreateRequestV1,
} from './target-person-create-command.js';

export {
  DEVICE_INSTALLATION_REVOKE_COMMAND_AUTHORITY_BINDING_V1,
  DeviceInstallationRevokeAuthorityPortErrorV1,
  revokeDeviceInstallation,
  type DeviceInstallationRevokeAuthorityFailureCodeV1,
  type DeviceInstallationRevokeAuthorityPortV1,
  type DeviceInstallationRevokeAuthorityRowV1,
  type RevokeDeviceInstallationInputV1,
  type RevokeDeviceInstallationResponseV1,
} from './device-installation-revoke-command.js';

export {
  getReadingProvenance,
  READING_PROVENANCE_READ_AUTHORITY_BINDING_V1,
  ReadingProvenanceReadAuthorityPortErrorV1,
  type GetReadingProvenanceInputV1,
  type ReadingProvenanceAuthorityRowV1,
  type ReadingProvenanceReadAuthorityFailureCodeV1,
  type ReadingProvenanceReadAuthorityPortV1,
  type ReadingProvenanceReadResponseV1,
} from './reading-provenance-read.js';

export {
  getReadingSessionProvenance,
  READING_SESSION_PROVENANCE_READ_AUTHORITY_BINDING_V1,
  ReadingSessionProvenanceReadAuthorityPortErrorV1,
  type GetReadingSessionProvenanceInputV1,
  type ReadingSessionProvenanceAuthorityRowV1,
  type ReadingSessionProvenanceReadAuthorityFailureCodeV1,
  type ReadingSessionProvenanceReadAuthorityPortV1,
  type ReadingSessionProvenanceReadResponseV1,
} from './reading-session-provenance-read.js';

export {
  correctTargetPersonBirth,
  TARGET_PERSON_BIRTH_CORRECTION_AUTHORITY_BINDINGS_V1,
  type CorrectTargetPersonBirthInputV1,
  type CorrectTargetPersonBirthResponseV1,
  type TargetPersonBirthCorrectionRequestV1,
} from './target-person-birth-correction-command.js';

export {
  createDirectReading,
  READING_CREATE_AUTHORITY_BINDING_V1,
  READING_CREATE_REQUEST_CONTRACT_VERSION_V1,
  ReadingCreateAuthorityPortErrorV1,
  type CreateDirectReadingInputV1,
  type CreateDirectReadingResponseV1,
  type DirectReadingCreateRequestV1,
  type ReadingCreateAuthorityFailureCodeV1,
  type ReadingCreateAuthorityPortV1,
  type ReadingCreateAuthorityRowV1,
  type ReadingCreateIdPortV1,
} from './reading-create-command.js';
