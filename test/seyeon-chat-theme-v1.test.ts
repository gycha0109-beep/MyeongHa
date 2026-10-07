import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

async function sha256(path: string) {
  const bytes = await readFile(repoFile(path));
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Seyeon chat theme v1', () => {
  it('pins the approved web and mobile theme bytes', async () => {
    await expect(
      sha256('apps/web/assets/characters/chat-themes/seyeon-chat-theme-web-v1.webp'),
    ).resolves.toBe('a48c2e7cd2df1b63c9c81fd097cb65ef304af653b8a68f027bfec438470fab52');

    await expect(
      sha256('apps/web/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp'),
    ).resolves.toBe('ba545f917394884502c5bc435df544296ea36a5c35319f52e01b7c2131906f4a');

    await expect(
      sha256('apps/mobile/assets/characters/chat-themes/seyeon-chat-theme-mobile-v1.webp'),
    ).resolves.toBe('ba545f917394884502c5bc435df544296ea36a5c35319f52e01b7c2131906f4a');
  });

  it('uses the approved chat theme instead of the unapproved legacy Seyeon room image', async () => {
    const [roomCss, conversationCss] = await Promise.all([
      readFile(repoFile('apps/web/chat-room.css'), 'utf8'),
      readFile(repoFile('apps/web/conversation-v2.css'), 'utf8'),
    ]);

    expect(roomCss).toContain('seyeon-chat-theme-web-v1.webp');
    expect(roomCss).toContain('seyeon-chat-theme-mobile-v1.webp');
    expect(conversationCss).toContain('seyeon-chat-theme-web-v1.webp');
    expect(conversationCss).toContain('seyeon-chat-theme-mobile-v1.webp');
    expect(conversationCss).not.toContain(
      '--conversation-room-art: url("assets/characters/rooms/seyeon-room.webp")',
    );
    expect(conversationCss).toContain('url("assets/characters/seyeon-portrait-v2.webp")');
  });

  it('keeps the theme presentation-only and static', async () => {
    const [decision, manifest] = await Promise.all([
      readFile(repoFile('docs/source-authority-decisions/SEYEON_CHAT_THEME_V1_APPROVAL.md'), 'utf8'),
      readFile(repoFile('docs/character/seyeon-chat-theme-v1.manifest.json'), 'utf8'),
    ]);

    expect(decision).toContain('NOT RESIDENCE CANON');
    expect(decision).toContain('별도 표정 전환이나 캐릭터 애니메이션을 추가하지 않는다');
    expect(decision).toContain('rooms/seyeon-room.webp');
    expect(JSON.parse(manifest).canonBoundary).toBe('presentation_only_not_residence_canon');
    expect(JSON.parse(manifest).mode).toBe('static');
  });
});
