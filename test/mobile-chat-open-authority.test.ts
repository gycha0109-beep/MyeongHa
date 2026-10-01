import { describe, expect, it } from 'vitest';

import { CHAT_LAUNCH_CHARACTER_IDS_V1 } from '../packages/api-client/src/index.js';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from '../apps/mobile/src/features/chat/chat-launch-roster.js';

describe('mobile M8-A Chat-open authority', () => {
  it('uses exactly the approved Launch nine canonical ids and official display names', () => {
    expect(CHAT_LAUNCH_CHARACTER_IDS_V1).toEqual([
      'seyeon',
      'yeoul',
      'seorin',
      'rahyeon',
      'mira',
      'taegyeom',
      'yunho',
      'doyun',
      'baekheon',
    ]);
    expect(MOBILE_CHAT_LAUNCH_ROSTER_V1).toEqual([
      { characterId: 'seyeon', displayName: '세연' },
      { characterId: 'yeoul', displayName: '여울' },
      { characterId: 'seorin', displayName: '서린' },
      { characterId: 'rahyeon', displayName: '라현' },
      { characterId: 'mira', displayName: '미라' },
      { characterId: 'taegyeom', displayName: '태겸' },
      { characterId: 'yunho', displayName: '윤호' },
      { characterId: 'doyun', displayName: '도윤' },
      { characterId: 'baekheon', displayName: '백헌' },
    ]);
  });

  it('documents M8-A as Member-only open/reuse while send and recent discovery stay blocked', async () => {
    const { readFile } = await import('node:fs/promises');
    const readRepoFile = (path: string) =>
      readFile(new URL(`../${path}`, import.meta.url), 'utf8');

    const architecture = await readRepoFile('docs/MOBILE_CLIENT_ARCHITECTURE_V1.md');
    const readme = await readRepoFile('apps/mobile/README.md');
    const service = await readRepoFile('apps/mobile/src/features/chat/mobile-chat-open-service.ts');

    expect(architecture).toContain('M8-A Member Chat open/reuse + exact Launch roster');
    expect(architecture).toContain('Guest Chat open remains disabled');
    expect(readme).toContain('Member-only Chat open/reuse');
    expect(readme).toContain('Chat thread discovery / recent-thread listing');
    expect(readme).toContain('Chat send');
    expect(service).toContain('withMemberBearer');
    expect(service).not.toContain('withActiveBearer');
    expect(service).not.toContain('withGuestBearer');
  });
});
