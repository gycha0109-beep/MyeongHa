import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const html = readFileSync(join(webRoot, 'hall.html'), 'utf8');
const client = readFileSync(join(webRoot, 'home-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'home-page.js'), 'utf8');
const lifeRecordRead = readFileSync(join(root, 'apps', 'api', 'src', 'life-record-ledger-read.ts'), 'utf8');
const characterResolver = readFileSync(join(root, 'apps', 'api', 'src', 'character-presentation-resolver.ts'), 'utf8');

describe('web Home authority boundary', () => {
  it('removes fabricated personalized Home claims', () => {
    expect(html).not.toContain('<span>지환</span>');
    expect(html).not.toContain('8월 31일 · 오늘의 흐름');
    expect(html).not.toContain('오늘은 움직이기보다');
    expect(html).not.toContain('퇴사를 고민했던 이야기');
    expect(html).not.toContain('남기로 결정했어요');
    expect(html).not.toContain('마지막 변화 · 8월 24일');
    expect(html).not.toContain('오늘은 좀 괜찮았어요?');
    expect(html).not.toContain('지난 이야기가 조금 신경 쓰였어요');
    expect(html).not.toContain('chat.html?character=seyeon');
  });

  it('binds only the current profile projection that Home can safely consume', () => {
    expect(client).toContain("const DEFAULT_PROFILE_ENDPOINT = '/v1/profile'");
    expect(client).toContain("method: 'GET'");
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
    expect(client).not.toContain('subjectId');
    expect(client).not.toContain('authUserId');
    expect(client).not.toContain('life-facts');
    expect(client).not.toContain('character');
  });

  it('uses the browser calendar for the date but does not invent a daily interpretation', () => {
    expect(page).toContain("new Intl.DateTimeFormat('ko-KR'");
    expect(page).toContain('new Date()');
    expect(html).toContain('오늘의 흐름은 사주 화면에서 직접 펼쳐볼 수 있습니다.');
    expect(html).not.toContain('좋은 흐름을 만듭니다');
  });

  it('does not derive a Life Thread from unresolved Life Fact type/value schemas', () => {
    expect(lifeRecordRead).toContain('does not define positive Life Fact type/value schemas while SRC-25 remains');
    expect(html).toContain('지금은 저장된 사실을 이야기로 추측해 이어 붙이지 않습니다.');
    expect(client).not.toContain('/v1/records/life-facts');
  });

  it('does not infer a today-character mapping in the browser', () => {
    expect(characterResolver).toContain('callers must not substitute');
    expect(characterResolver).toContain('infer the mapping in the browser');
    expect(html).toContain('캐릭터와 이야기하기');
    expect(html).not.toContain('세연');
    expect(html).not.toContain('오늘 이야기할 사람');
  });

  it('fails profile personalization back to a generic non-private label', () => {
    expect(html).toContain('id="home-profile-name">내 기록</span>');
    expect(page).toContain("byId('home-profile-name').textContent = '내 기록'");
    expect(page).toContain('catch {');
    expect(page).not.toContain('innerHTML');
  });
});
