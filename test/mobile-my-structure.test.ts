import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRepoFile(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('mobile M4-C My structure', () => {
  it('keeps My behind the service/loader boundary', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/my/index.tsx');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('SecureStore');
    expect(screen).not.toContain('Authorization');
    expect(screen).toContain('useMobileMyV1');
    expect(screen).toContain('useMobileMemberAuthV1');
    expect(screen).toContain('MyTargetPersonsSection');
  });

  it('exposes Member login without moving credentials into the screen layer', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    const hook = await readRepoFile('apps/mobile/src/features/my/use-mobile-member-auth.tsx');
    expect(components).toContain('secureTextEntry');
    expect(components).toContain('기존 계정으로 로그인');
    expect(hook).toContain('nativeMobileRuntimeV1.memberSession.signIn');
    expect(hook).toContain('nativeMobileRuntimeV1.memberSession.signOut');
    expect(hook).toContain('mobileNewMemberEnrollmentServiceV1.start');
    expect(hook).toContain('mobileNewMemberEnrollmentServiceV1.continueAfterVerification');
    expect(hook).not.toContain('SecureStore');
  });

  it('exposes new-account enrollment without enabling existing-member Guest merge', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    const service = await readRepoFile(
      'apps/mobile/src/features/my/mobile-new-member-enrollment.ts',
    );
    expect(components).toContain('새 계정 만들기');
    expect(components).toContain('가입 완료 후 이어가기');
    expect(components).toContain('가입 흐름 취소');
    expect(components).toContain('기존 회원 계정과의 게스트 기록 병합은 아직 지원하지 않습니다');
    expect(service).toContain('promoteGuestToNewMemberV1');
    expect(service).not.toContain('merge-guest');
  });

  it('opens Target Person create only while keeping later mutations closed', async () => {
    const screen = await readRepoFile('apps/mobile/src/app/(tabs)/my/index.tsx');
    const component = await readRepoFile(
      'apps/mobile/src/features/my/MyTargetPersons.tsx',
    );
    const service = await readRepoFile(
      'apps/mobile/src/features/my/mobile-my-service.ts',
    );

    expect(service).toContain('listTargetPersonsV1');
    expect(service).toContain('createTargetPersonV1');
    expect(component).toContain('등록된 대상');
    expect(component).toContain('새 대상 추가');
    expect(component).toContain('수정·삭제·궁합 실행은 아직 지원하지 않습니다');
    expect(component).not.toContain('수정하기');
    expect(component).not.toContain('삭제하기');
    expect(component).not.toContain('궁합 보기');
    expect(screen).not.toContain('/api/target-persons');
    expect(screen).not.toContain('fetch(');
  });

  it('keeps unavailable settings as non-Pressable information rows', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    const pendingBlock = components.slice(
      components.indexOf('export function MyPendingSettings'),
      components.indexOf('const styles'),
    );
    expect(pendingBlock).toContain('준비 중');
    expect(pendingBlock).not.toContain('<Pressable');
    expect(pendingBlock).not.toContain('onPress=');
  });

  it('exposes only working navigation cards for current mobile routes', async () => {
    const components = await readRepoFile('apps/mobile/src/features/my/MyComponents.tsx');
    expect(components).toContain("route: '/reading'");
    expect(components).toContain("route: '/records'");
    expect(components).toContain("route: '/chat'");
    expect(components).toContain("router.push('/birth')");
  });
});
