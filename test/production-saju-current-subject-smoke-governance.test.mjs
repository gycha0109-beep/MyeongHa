import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  buildProductionSajuGuestBirthLabel,
  fingerprintProductionSajuGuestFixture,
  requireProductionSajuGuestRunId,
} from '../scripts/production-saju-guest-fixture-audit.mjs';

const scriptPath = 'scripts/verify-production-saju-current-subject.mjs';
const workflowPath = '.github/workflows/production-saju-current-subject-smoke.yml';

describe('Production current-subject Saju smoke governance', () => {
  it('covers both public Saju execution routes without logging response bodies or credentials', () => {
    const source = readFileSync(scriptPath, 'utf8');

    expect(source).toContain('/api/me/saju/calculation');
    expect(source).toContain('/api/me/saju/preview-reading');
    expect(source).toContain('/api/session/bootstrap');
    expect(source).toContain('/api/birth-profiles');
    expect(source).toContain("const SAJU_PREVIEW_READING_TEXT = '전체 사주';");
    expect(source).toContain('buildProductionSajuGuestBirthLabel(guestRunId)');
    expect(source).toContain("body: JSON.stringify({ readingText: SAJU_PREVIEW_READING_TEXT })");
    expect(source).toContain("requireExact(`${label} lifecycle`, data.lifecycle, 'preview')");
    expect(source).toContain("'myeonghwa-product-reading-response-v2'");
    expect(source).toContain("['delivered', ['READING_DELIVERED', 'none']]");
    expect(source).toContain("['delivered_with_fallback', ['READING_DELIVERED_WITH_GROUNDED_FALLBACK', 'none']]");
    expect(source).toContain("['partial_evidence', ['READING_EVIDENCE_PARTIAL', 'none']]");
    expect(source).toContain("['insufficient_evidence', ['READING_EVIDENCE_INSUFFICIENT', 'none']]");
    expect(source).toContain('JSON.stringify(previewReading.body).includes(accessToken)');
    expect(source).toContain("bootstrapData.kind");
    expect(source).toContain("'guest'");
    expect(source).toContain("guestMeData.subjectKind");
    expect(source).toContain("guestCalculation = await requestCalculation");
    expect(source).toContain("guestPreviewReading = await requestPreviewReading");
    expect(source).toContain('JSON.stringify(guestCalculation.body).includes(guest.bearerToken)');
    expect(source).toContain('JSON.stringify(guestPreviewReading.body).includes(guest.bearerToken)');
    expect(source).not.toContain('console.log(previewReading.body)');
    expect(source).not.toContain('console.log(guestPreviewReading.body)');
    expect(source).not.toContain('console.log(accessToken)');
    expect(source).not.toContain('console.log(guest.bearerToken)');
    expect(source).toContain('stage=bootstrap_confirmed');
    expect(source).toContain('stage=birth_create_requested');
    expect(source).toContain('stage=birth_create_confirmed');
    expect(source).toContain('guestPreviewReading.state !== \'delivered\'');
    expect(source).toContain('guestFixtureCreated=true');
    expect(source).not.toContain('console.log(guestSubjectId)');
    expect(source).not.toContain('console.log(birthProfileId)');
  });

  it('keeps the existing Member and Guest coverage gated by the governed Production workflow', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('VERIFY_SAJU_CURRENT_SUBJECT');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('node scripts/verify-production-saju-current-subject.mjs');
    expect(workflow).toContain('MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID');
    expect(workflow).toContain("github.event_name == 'push' && 'member_only' || inputs.scope");
    expect(workflow).not.toContain('schedule:');
  });

  it('defaults manual dispatch to Member-only and does not create a Guest Birth fixture in that scope', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const source = readFileSync(scriptPath, 'utf8');

    expect(workflow).toContain('type: choice');
    expect(workflow).toContain('default: member_only');
    expect(workflow).toContain('          - member_only');
    expect(workflow).toContain('          - member_and_guest');
    expect(workflow).toContain('MYEONGHA_SAJU_SMOKE_SCOPE');
    expect(source).toContain("process.env.MYEONGHA_SAJU_SMOKE_SCOPE ?? 'member_only'");
    expect(source).toContain("smokeScope !== 'member_only' && smokeScope !== 'member_and_guest'");
    const memberOnlyBranch = source.indexOf("if (smokeScope === 'member_only') {");
    const guestCreation = source.indexOf('const guest = await createGuestSajuFixture();');
    expect(memberOnlyBranch).toBeGreaterThan(0);
    expect(guestCreation).toBeGreaterThan(memberOnlyBranch);
    expect(source.slice(memberOnlyBranch, guestCreation)).toContain('} else {');
    expect(source.slice(memberOnlyBranch, guestCreation)).toContain('guestFixtureCreated=false');
    expect(source.slice(memberOnlyBranch, guestCreation)).toContain('JSON.stringify(previewReading.body).includes(accessToken)');
    expect(workflow).toContain('MYEONGHA_SAJU_GUEST_WRITE_CONFIRM');
    expect(workflow).toContain('guest_write_confirm:');
    expect(workflow).toContain('VERIFY_SAJU_GUEST_WRITE');
    expect(workflow).toContain('GITHUB_RUN_ID');
    expect(source).toContain("smokeScope === 'member_and_guest'");
    expect(source).toContain("process.env.MYEONGHA_SAJU_GUEST_WRITE_CONFIRM !== 'VERIFY_SAJU_GUEST_WRITE'");
    expect(source.indexOf('VERIFY_SAJU_GUEST_WRITE')).toBeLessThan(source.indexOf('acquireProductionMemberSmokeSession()'));
  });

  it('denies Production Guest writes on repeat runs, push events, or missing run provenance', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const source = readFileSync(scriptPath, 'utf8');
    expect(workflow).toContain('[[ "$GITHUB_RUN_ATTEMPT" == \'1\' ]]');
    expect(source).toContain("process.env.GITHUB_RUN_ATTEMPT !== '1'");
    expect(source).toContain("process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'");

    for (const [eventName, attempt] of [
      ['workflow_dispatch', '2'],
      ['push', '1'],
      ['workflow_dispatch', ''],
    ]) {
      const denied = spawnSync(process.execPath, [scriptPath], {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          MYEONGHA_SAJU_SMOKE_SCOPE: 'member_and_guest',
          MYEONGHA_SAJU_GUEST_WRITE_CONFIRM: 'VERIFY_SAJU_GUEST_WRITE',
          GITHUB_EVENT_NAME: eventName,
          GITHUB_RUN_ATTEMPT: attempt,
        },
      });
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain('first manual workflow_dispatch attempt');
      expect(denied.stdout).not.toContain('Saju smoke passed');
    }
  });

  it('correlates one synthetic Birth label to the approved GitHub run and fails closed for absent/invalid provenance', () => {
    expect(buildProductionSajuGuestBirthLabel('39066237847'))
      .toBe('production-saju-guest-smoke-v1-run-39066237847');
    for (const invalid of [undefined, '', '0', '1/2', '01', '1'.repeat(21)]) {
      expect(() => requireProductionSajuGuestRunId(invalid)).toThrow('GITHUB_RUN_ID');
    }
    const denied = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        MYEONGHA_SAJU_SMOKE_SCOPE: 'member_and_guest',
        MYEONGHA_SAJU_GUEST_WRITE_CONFIRM: 'VERIFY_SAJU_GUEST_WRITE',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_RUN_ID: '',
      },
    });
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).toContain('GITHUB_RUN_ID is required');
    expect(denied.stdout).not.toContain('bootstrap_requested');
  });

  it('emits only deterministic, domain-separated redacted fixture identifiers', () => {
    const a = '19a8ab4b-c743-4e00-9c40-8c1786000123';
    const b = '19a8ab4b-c743-4e00-9c40-8c1786000124';
    const subject = fingerprintProductionSajuGuestFixture('subject', a);
    expect(subject).toMatch(/^sha256:[0-9a-f]{24}$/u);
    expect(subject).toBe(fingerprintProductionSajuGuestFixture('subject', a.toUpperCase()));
    expect(subject).not.toContain(a);
    expect(subject).not.toBe(fingerprintProductionSajuGuestFixture('birth_profile', a));
    expect(subject).not.toBe(fingerprintProductionSajuGuestFixture('subject', b));
    for (const [kind, id] of [['random', a], ['subject', 'not-a-uuid']]) {
      expect(() => fingerprintProductionSajuGuestFixture(kind, id)).toThrow();
    }
  });

  it('rejects unauthorized Production Guest writes before any session acquisition or API request', () => {
    const denied = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        MYEONGHA_SAJU_SMOKE_SCOPE: 'member_and_guest',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_RUN_ATTEMPT: '1',
        MYEONGHA_SAJU_GUEST_WRITE_CONFIRM: 'NOT_AUTHORIZED',
      },
    });
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).toContain('Production Guest fixture creation requires explicit');
    expect(denied.stdout).not.toContain('Saju smoke passed');
  });
});
