import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_READER_S5_SAFE_CHAT_MARKER_TEXT_V1,
  isOfficialReaderS5SafeMarkerForOrdinaryContextV1,
  excludeOfficialReaderS5SafeMarkersFromOrdinaryContextV1,
} from '../apps/api/src/official-reader-s4-ordinary-context-isolation-v1.js';

/**
 * S4 synthetic HTTP/Reader-context seam: the approved paid-answer marker
 * remains in ordinary Chat history, but must never be a model prompt,
 * memory-proposal source, ordinary summary or search input. Protected body
 * is not queried or generated here; other S6/DB policies govern that path.
 */
describe('Privacy #2318 paid Reader safe-message AI reinjection fence', () => {
  const SAFE = OFFICIAL_READER_S5_SAFE_CHAT_MARKER_TEXT_V1;
  const USER_ID = 'synthetic-private-refund-user';
  const NORMAL = '일반 대화는 환불 후에도 기존 정책에 따라 유지합니다.';

  it('removes the exact S5 system marker before ordinary Reader/AI context assembly', () => {
    const recentMessages = Object.freeze([
      Object.freeze({ messageId: 'system-paid-answer', senderType: 'system', text: SAFE }),
      Object.freeze({ messageId: 'ordinary-user', senderType: 'user', text: NORMAL }),
      Object.freeze({ messageId: 'ordinary-assistant', senderType: 'character', text: '안녕하세요.' }),
      Object.freeze({ messageId: 'another-system', senderType: 'system', text: '일반 서비스 안내' }),
    ]);
    const forModel = excludeOfficialReaderS5SafeMarkersFromOrdinaryContextV1(recentMessages);
    expect(forModel.map(x => x.messageId)).toEqual([
      'ordinary-user', 'ordinary-assistant', 'another-system',
    ]);
    expect(JSON.stringify(forModel)).not.toContain(SAFE);
    expect(recentMessages).toHaveLength(4);
    expect(Object.isFrozen(forModel)).toBe(true);
    expect(forModel[0]).toBe(recentMessages[1]);
  });

  it('keeps user-authored identical prose; never treats keywords or metadata as paid authority', () => {
    const messages = [
      { senderType: 'user', text: SAFE, subjectId: USER_ID },
      { senderType: 'character', text: SAFE },
      { senderType: 'system', text: '유료 해설이 아니라 일반 서비스 안내입니다.' },
      { senderType: 'system', text: SAFE },
    ] as const;
    const result = excludeOfficialReaderS5SafeMarkersFromOrdinaryContextV1(messages);
    expect(result).toEqual(messages.slice(0, 3));
    expect(isOfficialReaderS5SafeMarkerForOrdinaryContextV1(messages[0])).toBe(false);
    expect(isOfficialReaderS5SafeMarkerForOrdinaryContextV1(messages[3])).toBe(true);
  });

  it('rejects every exact safe SYSTEM marker, including replayed duplicates', () => {
    const replayed = Array.from({ length: 4 }, (_, index) => ({
      senderType: 'system', text: SAFE, messageId: 'paid-' + index,
    }));
    const context = excludeOfficialReaderS5SafeMarkersFromOrdinaryContextV1([
      ...replayed, { senderType: 'user', text: NORMAL, messageId: 'normal' },
    ]);
    expect(context).toHaveLength(1);
    expect(context[0]?.messageId).toBe('normal');
    expect(context[0]?.text).toBe(NORMAL);
  });
});
