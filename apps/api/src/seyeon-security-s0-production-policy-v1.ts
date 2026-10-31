// Watchtower-Track: security
// Server-owned scope/policy. Neither HTTP fields nor environment flags activate it.
import type {SeyeonProductionChatGovernorApprovalV1} from './seyeon-production-governor-factory-v1.js';
import type {SeyeonCostGovernorModelPolicyV1} from './seyeon-cost-governor-server-policy-v1.js';
import {COMMERCE_CHAT_CREDIT_POLICY_V1} from './commerce-chat-credit-gate-v1.js';

export const SEYEON_SECURITY_S0_PRODUCTION_V1=Object.freeze({
  contractVersion:'seyeon-positive-http-receipt-barrier-v1',
  receiptAndWithdrawalEnabled:true,
  modelUseEnabled:true,
  // Trusted server code permits the GLM spoken-reply cutover only when a
  // server-side OpenRouter secret is installed. No browser or env flag enables it.
  glmRendererApproved:true,
  // Existing credit entitlement is the only customer admission policy.
  // Paid turns cannot reach the provider until the actual production path
  // atomically reserves credits and settles only on a verified receipt.
  creditBilling:Object.freeze({
    creditsPerDeliveredReply:COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
    reservationRequiredBeforeModel:true,
    settleOnlyAfterDeliveryReceipt:true,
    productionMounted:false,
  }),
  model:'gpt-5.6-terra',
  recordType:'conversation_recall',schemaVersion:'v1',
  projectorVersion:'seyeon-conversation-recall-projector-v1',
  memoryCount:1,historyEnabled:false,replayEnabled:false,
  promptCachingEnabled:false,
});
const policy=(allowedPurposes:SeyeonCostGovernorModelPolicyV1['allowedPurposes']):SeyeonCostGovernorModelPolicyV1=>Object.freeze({
  policyVersion:'seyeon-s0-receipt-production-20261025',
  providerKey:'openai-responses',modelKey:SEYEON_SECURITY_S0_PRODUCTION_V1.model,
  allowedPurposes:Object.freeze([...allowedPurposes]),
  contextWindowTokens:1_050_000,maximumInputTokens:48_000,
  maximumOutputTokens:4096,maximumSerializedRequestBytes:524288,
  priceQuote:Object.freeze({priceVersion:'openai-terra-20261025-no-cache',
    providerKey:'openai-responses',modelKey:SEYEON_SECURITY_S0_PRODUCTION_V1.model,
    inputMicroUsdPerMillion:2_000_000,cachedInputMicroUsdPerMillion:200_000,
    outputMicroUsdPerMillion:12_000_000}),
});
export const SEYEON_SECURITY_S0_GOVERNOR_APPROVAL_V1:SeyeonProductionChatGovernorApprovalV1=Object.freeze({
  policies:Object.freeze({
    preflight:policy(['integrity_classification','disclosure_classification']),
    interpreter:policy(['turn_interpretation']),renderer:policy(['dialogue_render']),
    reviewer:policy(['semantic_review']),
  }),reservedHeadroomTokens:1024,timeoutMs:8000,
});
