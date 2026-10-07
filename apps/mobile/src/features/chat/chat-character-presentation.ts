import type { ChatLaunchCharacterIdV1 } from '@myeongha/api-client';

export interface MobileChatCharacterPresentationV1 {
  readonly title: string;
  readonly openingLine: string;
  readonly tags: readonly [string, string, string];
}

/**
 * Presentation-only metadata for the approved Launch Character IDs.
 * This does not grant server availability, publication, or chat authority.
 */
export const MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1 = Object.freeze({
  seyeon: Object.freeze({
    title: '무녀',
    openingLine: '왔네요. 오늘은 어떤 이야기부터 해볼까요?',
    tags: Object.freeze(['밝고 가까운', '따뜻한', '편하게'] as const),
  }),
  yeoul: Object.freeze({
    title: '설계관 기록관',
    openingLine: '그래서, 무슨 얘기인데요? 듣고는 있을게요.',
    tags: Object.freeze(['새침한', '빠른 반응', '솔직한'] as const),
  }),
  seorin: Object.freeze({
    title: '기억 서고지기',
    openingLine: '천천히 말씀해 주세요. 지금부터 함께 볼게요.',
    tags: Object.freeze(['조용한', '기억', '천천히'] as const),
  }),
  rahyeon: Object.freeze({
    title: '대리자',
    openingLine: '말해봐요. 어디서부터 시작할지는 당신이 정해요.',
    tags: Object.freeze(['성숙한', '긴장감', '주도적인'] as const),
  }),
  mira: Object.freeze({
    title: '대리자',
    openingLine: '편하게 말해요. 듣고 있을게요.',
    tags: Object.freeze(['무심다정', '친구 같은', '담백한'] as const),
  }),
  taegyeom: Object.freeze({
    title: '대리자',
    openingLine: '핵심부터 말해보죠. 무엇이 가장 걸립니까?',
    tags: Object.freeze(['차가운', '까다로운', '핵심부터'] as const),
  }),
  yunho: Object.freeze({
    title: '대리자',
    openingLine: '천천히 말씀하셔도 됩니다. 어떤 이야기부터 시작할까요?',
    tags: Object.freeze(['따뜻한', '안정적인', '지적인'] as const),
  }),
  doyun: Object.freeze({
    title: '대리자',
    openingLine: '자, 무슨 얘기부터 해볼까요? 편하게 말해요.',
    tags: Object.freeze(['자유로운', '능청스러운', '가벼운'] as const),
  }),
  baekheon: Object.freeze({
    title: '충추원의 장',
    openingLine: '이야기를 시작하죠. 지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?',
    tags: Object.freeze(['선택과 책임', '차분한', '직설적인'] as const),
  }),
} satisfies Readonly<Record<ChatLaunchCharacterIdV1, MobileChatCharacterPresentationV1>>);

export function resolveMobileChatCharacterPresentationV1(
  characterId: ChatLaunchCharacterIdV1,
): MobileChatCharacterPresentationV1 {
  return MOBILE_CHAT_CHARACTER_PRESENTATION_BY_ID_V1[characterId];
}
