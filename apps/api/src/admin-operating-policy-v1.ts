/** Product-owner decisions, 2026-10-27. These do not activate Production. */
export const ADMIN_OPERATING_POLICY_VERSION_V1='admin-operating-policy-20261027-v1' as const;
export const ANALYTICS_RETENTION_DAYS_V1=180;
export const ANALYTICS_RETENTION_SECONDS_V1=ANALYTICS_RETENTION_DAYS_V1*86400;
export const ADMIN_AUDIT_RETENTION_DAYS_V1=365;
export const ADMIN_AI_MONTHLY_BUDGET_KRW_V1=100_000;
export const ADMIN_AI_BUDGET_THRESHOLDS_V1=Object.freeze([80,100] as const);
export const ADMIN_AI_BUDGET_TIMEZONE_V1='Asia/Seoul' as const;
export const ADMIN_CREDIT_FIXED_LIMIT_V1=null;
export const ADMIN_CREDIT_CONFIRMATION_REQUIRED_V1=true;
export const ADMIN_PARTIAL_REFUND_POLICY_V1='existing_provider_and_domain_support_required' as const;
