// Watchtower-Track: security
export declare const SEYEON_S0_COST_POLICY_DRAFT_V1: Readonly<{
 providerKey:string; modelKey:string; policyVersion:string; priceVersion:string;
 allowedPurposes:readonly string[]; contextWindowTokens:number; maximumInputTokens:number;
 maximumOutputTokens:number; maximumSerializedRequestBytes:number;
 inputMicroUsdPerMillion:number; cachedInputMicroUsdPerMillion:number;
 outputMicroUsdPerMillion:number; isActive:false;
}>;
export declare function parseSeyeonS0CostBudgetV1(input:Readonly<{
 utcDate:string|null;globalMicroUsd:string|null;subjectMicroUsd:string|null;
}>):Readonly<{utcDate:string;globalMicroUsd:string;subjectMicroUsd:string}>;
