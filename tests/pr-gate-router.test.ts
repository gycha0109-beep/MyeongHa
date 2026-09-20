import { describe, expect, it } from 'vitest';
import { resolvePrGates } from '../scripts/ci/pr-gate-router.mjs';

describe('PR gate router', () => {
  it('routes chat-only web changes to the chat browser gate', () => {
    expect(resolvePrGates([
      'apps/web/src/chat/ChatPage.tsx',
      'apps/web/chat-room.css',
      'scripts/verify-web-conversation-browser-render.mjs',
    ])).toEqual({
      chat: true,
      saju: false,
      records: false,
      profile: false,
      full: false,
      db: false,
    });
  });

  it('routes Saju and Records changes independently when both are touched', () => {
    expect(resolvePrGates([
      'apps/web/reading-reader-picker.js',
      'apps/web/records-page.js',
    ])).toEqual({
      chat: false,
      saju: true,
      records: true,
      profile: false,
      full: false,
      db: false,
    });
  });

  it('routes My and Birth changes to the profile browser gate', () => {
    expect(resolvePrGates([
      'apps/web/src/my/MyPage.tsx',
      'apps/web/birth-runtime-client.js',
    ])).toEqual({
      chat: false,
      saju: false,
      records: false,
      profile: true,
      full: false,
      db: false,
    });
  });

  it('promotes shared web infrastructure to the full browser gate', () => {
    expect(resolvePrGates([
      'apps/web/product-theme.js',
      'apps/web/src/chat/ChatPage.tsx',
    ])).toEqual({
      chat: false,
      saju: false,
      records: false,
      profile: false,
      full: true,
      db: false,
    });
  });

  it('fails safe for a future unclassified web surface', () => {
    expect(resolvePrGates([
      'apps/web/src/future-oracle/FutureOraclePage.tsx',
    ])).toEqual({
      chat: false,
      saju: false,
      records: false,
      profile: false,
      full: true,
      db: false,
    });
  });

  it('ignores non-web domain changes so unit/type/build gates can handle them', () => {
    expect(resolvePrGates([
      'packages/domain/src/character-saju-council.ts',
      'apps/api/src/character-chat-orchestration.ts',
      'test/face-reading-fr10-character-presentation-invariance.test.ts',
    ])).toEqual({
      chat: false,
      saju: false,
      records: false,
      profile: false,
      full: false,
      db: false,
    });
  });

  it('routes migration and DB authority changes to the DB gate', () => {
    expect(resolvePrGates([
      'supabase/migrations/1220_example.sql',
      'test/db/chat_receive_concurrency.sh',
    ])).toEqual({
      chat: false,
      saju: false,
      records: false,
      profile: false,
      full: false,
      db: true,
    });
  });
});
