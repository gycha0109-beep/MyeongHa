import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const html = readFileSync(join(webRoot, 'hall.html'), 'utf8');
const client = readFileSync(join(webRoot, 'home-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'src', 'home', 'HomePage.tsx'), 'utf8');
const homeSource = `${html}\n${page}`;
const authUi = readFileSync(join(webRoot, 'product-auth-ui.js'), 'utf8');
const lifeRecordRead = readFileSync(join(root, 'apps', 'api', 'src', 'life-record-ledger-read.ts'), 'utf8');
const characterResolver = readFileSync(join(root, 'apps', 'api', 'src', 'character-presentation-resolver.ts'), 'utf8');

describe('web Home authority boundary', () => {
  it('removes fabricated personalized Home claims', () => {
    expect(homeSource).not.toContain('<span>지환</span>');
    expect(homeSource).not.toContain('8월 31일 · 오늘의 흐름');
    expect(homeSource).not.toContain('오늘은 움직이기보다');
    expect(homeSource).not.toContain('퇴사를 고민했던 이야기');
    expect(homeSource).not.toContain('남기로 결정했어요');
    expect(homeSource).not.toContain('마지막 변화 · 8월 24일');
    expect(homeSource).not.toContain('오늘은 좀 괜찮았어요?');
    expect(homeSource).not.toContain('지난 이야기가 조금 신경 쓰였어요');
    expect(homeSource).not.toContain('chat.html?character=seyeon');
  });

  it('binds only the canonical current-subject profile route', () => {
    expect(client).toContain("const DEFAULT_PROFILE_ENDPOINT = '/api/me'");
    expect(client).toContain("method: 'GET'");
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
    expect(client).toContain("from './api-envelope.js'");
    expect(client).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(client).not.toContain('/v1/profile');
    expect(client).not.toContain('subjectId');
    expect(client).not.toContain('authUserId');
    expect(client).not.toContain('life-facts');
    expect(client).not.toContain('character');
  });

  it('discloses currently available preview scope without inventing monthly or daily interpretations', () => {
    expect(homeSource).toContain('정식 읽기 제공 여부는 상세 화면에서 확인할 수 있습니다.');
    expect(homeSource).toContain('월간 해석은 준비 중입니다.');
    expect(page).toContain('공식 사주 운세와는 별개입니다.');
    expect(homeSource).not.toContain('href="reading-detail.html?scope=month"');
    expect(homeSource).not.toContain('오늘의 흐름은 사주 화면에서 직접 펼쳐볼 수 있습니다.');
    expect(homeSource).not.toContain('좋은 흐름을 만듭니다');
  });

  it('does not derive a Life Thread from unresolved Life Fact type/value schemas', () => {
    expect(lifeRecordRead).toContain('does not define positive Life Fact type/value schemas while SRC-25 remains');
    expect(homeSource).toContain('최근 대화 기록은 아직 홈에 연결되지 않았습니다.');
    expect(client).not.toContain('/api/life-record');
  });

  it('shows only existing character presentation entries without minting chat authority', () => {
    expect(characterResolver).toContain('callers must not substitute');
    expect(characterResolver).toContain('infer the mapping in the browser');
    expect(page).toContain("findReaderPresentation(key)");
    expect(page).toContain('reader.portrait');
    expect(page).toContain('href="chat-hub.html"');
    expect(homeSource).not.toContain('chat.html?character=');
  });

  it('keeps the static My fallback while delegating live header auth state to the shared renderer', () => {
    expect(html).toContain('id="home-profile-name">마이</span>');
    expect(page).not.toContain('home-profile-name');
    expect(page).not.toContain('createHomeRuntimeClient');
    expect(authUi).toContain("const label = profile.querySelector('.product-profile-mark + span')");
    expect(authUi).toContain("if (label) label.textContent = '마이'");
    expect(authUi).toContain("if (label) label.textContent = '로그인'");
    expect(page).not.toContain('innerHTML');
  });
});
