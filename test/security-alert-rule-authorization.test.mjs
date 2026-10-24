import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { authorizeSecurityAlertRule } from '../scripts/lib/security-alert-rule-authorization.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const authorityPath = 'config/security/production-security-alerting-v1.json';
const desiredPath = 'config/security/vercel-production-4xx-error-anomaly-rule-candidate-v1.json';
const decision = read('config/security/production-4xx-security-alert-decision-candidate-v1.json');
const input = () => ({ mode: 'preflight', authorityPath, desiredPath, authority: read(authorityPath), desired: read(desiredPath), decision: structuredClone(decision) });

describe('supported Vercel 4xx anomaly execution authorization', () => {
  it('permits read-only preflight for the exact candidate but prevents activation', () => {
    expect(() => authorizeSecurityAlertRule(input())).not.toThrow();
    expect(() => authorizeSecurityAlertRule({ ...input(), mode: 'activate' })).toThrow('SECURITY_ALERT_RULE_NOT_AUTHORIZED');
  });
  it('requires both explicit policy and production mutation authorization for the exact rule', () => {
    const value = input();
    value.mode = 'activate';
    value.decision.policyAuthority = 'APPROVED';
    expect(() => authorizeSecurityAlertRule(value)).toThrow();
    value.decision.productionMutationAuthorized = true;
    expect(() => authorizeSecurityAlertRule(value)).not.toThrow();
  });
  it('rejects project widening, numeric thresholds and mismatched decision files', () => {
    for (const change of [
      (value) => { value.desired.ruleScope = { type: 'all' }; },
      (value) => { value.decision.fixedThreshold = 10; },
      (value) => { value.decision.ruleConfig = 'different.json'; },
      (value) => { value.desired.triggers.items[0].filter = 'statusGroup:5xx'; },
    ]) {
      const value = input();
      change(value);
      expect(() => authorizeSecurityAlertRule(value)).toThrow();
    }
  });
  it('preserves the existing governed 5xx activation path', () => {
    const value = input();
    value.mode = 'activate';
    value.desiredPath = value.authority.activation.ruleConfig;
    value.desired = read(value.desiredPath);
    delete value.decision;
    expect(() => authorizeSecurityAlertRule(value)).not.toThrow();
  });
});
