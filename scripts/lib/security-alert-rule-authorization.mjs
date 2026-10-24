import { resolve } from 'node:path';

/** Keep the existing 5xx contract; additional rules need their own explicit decision. */
export function authorizeSecurityAlertRule({ mode, desiredPath, authorityPath, desired, authority, decision }) {
  const reject = () => { throw new Error('SECURITY_ALERT_RULE_NOT_AUTHORIZED'); };
  if (!['preflight', 'activate', 'require'].includes(mode) ||
      desired.type !== 'built-in' || desired.ruleScope?.type !== 'include' ||
      JSON.stringify(desired.ruleScope?.projectIds) !== JSON.stringify([authority.project?.id])) reject();
  const existing = typeof authority.activation?.ruleConfig === 'string' &&
    resolve(desiredPath) === resolve(authority.activation.ruleConfig);
  if (existing) {
    if (desired.name !== 'MyeongHa Production 5xx Error Anomalies' ||
        JSON.stringify(desired.triggers) !== JSON.stringify({ mode: 'selected', items: [{ type: 'error_anomaly', filter: 'statusGroup:5xx' }] })) reject();
    return;
  }
  if (decision?.schemaVersion !== 'myeongha-security-alert-decision-candidate-v1' ||
      typeof decision.ruleConfig !== 'string' || typeof decision.transportAuthority !== 'string' ||
      resolve(decision.ruleConfig) !== resolve(desiredPath) || resolve(decision.transportAuthority) !== resolve(authorityPath) ||
      decision.numericThresholdOwnedBy !== 'vercel-native-anomaly-model' || decision.fixedThreshold !== null ||
      desired.name !== 'MyeongHa Production API 4xx Error Anomalies' ||
      desired.matchMinimumSeverityLevel !== 'high' || desired.notificationSettings?.enableTeamOwnerNotifications !== true ||
      JSON.stringify(desired.triggers) !== JSON.stringify({ mode: 'selected', items: [{ type: 'error_anomaly', filter: 'statusGroup:4xx AND route:/api/*' }] })) reject();
  if (mode === 'activate' && (decision.policyAuthority !== 'APPROVED' || decision.productionMutationAuthorized !== true)) reject();
}
