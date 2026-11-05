import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('My native account boundary and stale fetch suppression', () => {
  it('resets profile, Birth and target-person facts after verified credential mutations', async () => {
    const [hook, screen] = await Promise.all([
      readFile(new URL('../apps/mobile/src/features/my/use-mobile-my.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../apps/mobile/src/app/(tabs)/my/index.tsx', import.meta.url), 'utf8'),
    ]);
    expect(hook).toContain('useState<MobileMyStateV1>(MOBILE_MY_LOADING_STATE_V1)');
    expect(hook).toContain('subscribeMobileSubjectCredentialChangesV1(restartForCurrentSubject)');
    expect(hook).toContain('setState(MOBILE_MY_LOADING_STATE_V1)');
    expect(hook).toContain("setTargetPersonCreate({ kind: 'idle' })");
    expect(hook).toContain('const epoch = ++subjectEpoch.current');
    expect(hook).toContain('focused.current && epoch === subjectEpoch.current');
    expect(hook).toContain('unsubscribe()');
    expect(screen).toContain('subscribeMobileSubjectCredentialChangesV1(refreshSessionForCurrentSubject)');
    expect(screen).toContain('setMemberSessionPresent(null)');
    expect(screen).toContain('requestEpoch === epoch');
  });

  it('never publishes previous-subject retry or create completion after focus/credential change', async () => {
    const hook = await readFile(new URL('../apps/mobile/src/features/my/use-mobile-my.tsx', import.meta.url), 'utf8');
    const retryStart = hook.indexOf('const retryProfile');
    const retryEnd = hook.indexOf('const createTargetPerson');
    const retries = hook.slice(retryStart, retryEnd);
    for (const name of ['retryProfile', 'retryBirth', 'retryTargetPersons']) {
      expect(retries).toContain(`const ${name} = useCallback`);
    }
    expect(retries.split('if (!focused.current) return;').length - 1).toBe(3);
    expect(retries.split('if (focused.current && epoch === subjectEpoch.current)').length - 1).toBe(3);
    const create = hook.slice(retryEnd);
    expect(create).toContain('if (!focused.current || epoch !== subjectEpoch.current) return false');
    expect(create).toContain('if (focused.current && epoch === subjectEpoch.current)');
    expect(create).toContain('mobileMyServiceV1.createTargetPerson(request)');
    expect(create).not.toContain('subscribeMobileSubjectCredentialChangesV1(');
  });
});
