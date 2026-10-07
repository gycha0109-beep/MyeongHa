import type { ChatLaunchCharacterIdV1 } from '@myeongha/api-client';

export interface MobileChatLaunchCharacterV1 {
  readonly characterId: ChatLaunchCharacterIdV1;
  readonly displayName: string;
  readonly title: string;
  readonly openingLine: string;
  readonly tags: readonly string[];
}

/**
 * Mobile presentation-only metadata for the approved nine Launch Character IDs.
 * These fields do not grant server availability or publication authority.
 */
export const MOBILE_CHAT_LAUNCH_ROSTER_V1 = Object.freeze([
  Object.freeze({
    characterId: 'seyeon',
    displayName: '세연',
    title: '무녀',
    openingLine: '왔네요. 오늘은 어떤 이야기부터 해볼까요?',
    tags: Object.freeze(['밝고 가까운', '따뜻한', '편하게']),
  }),
  Object.freeze({
    characterId: 'yeoul',
    displayName: '여울',
    title: '설계관 기록관',
    openingLine: '그래서, 무슨 얘기인데요? 듣고는 있을게요.',
    tags: Object.freeze(['새침한', '빠른 반응', '솔직한']),
  }),
  Object.freeze({
    characterId: 'seorin',
    displayName: '서린',
    title: '기억 서고지기',
    openingLine: '천천히 말씀해 주세요. 지금부터 함께 볼게요.',
    tags: Object.freeze(['조용한', '기억', '천천히']),
  }),
  Object.freeze({
    characterId: 'rahyeon',
    displayName: '라현',
    title: '대리자',
    openingLine: '말해봐요. 어디서부터 시작할지는 당신이 정해요.',
    tags: Object.freeze(['성숙한', '긴장감', '주도적인']),
  }),
  Object.freeze({
    characterId: 'mira',
    displayName: '미라',
    title: '대리자',
    openingLine: '편하게 말해요. 듣고 있을게요.',
    tags: Object.freeze(['무심다정', '친구 같은', '담백한']),
  }),
  Object.freeze({
    characterId: 'taegyeom',
    displayName: '태겸',
    title: '대리자',
    openingLine: '핵심부터 말해보죠. 무엇이 가장 걸립니까?',
    tags: Object.freeze(['차가운', '까다로운', '핵심부터']),
  }),
  Object.freeze({
    characterId: 'yunho',
    displayName: '윤호',
    title: '대리자',
    openingLine: '천천히 말씀하셔도 됩니다. 어떤 이야기부터 시작할까요?',
    tags: Object.freeze(['따뜻한', '안정적인', '지적인']),
  }),
  Object.freeze({
    characterId: 'doyun',
    displayName: '도윤',
    title: '대리자',
    openingLine: '자, 무슨 얘기부터 해볼까요? 편하게 말해요.',
    tags: Object.freeze(['자유로운', '능청스러운', '가벼운']),
  }),
  Object.freeze({
    characterId: 'baekheon',
    displayName: '백헌',
    title: '충추원의 장',
    openingLine: '이야기를 시작하죠. 지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?',
    tags: Object.freeze(['선택과 책임', '차분한', '직설적인']),
  }),
] satisfies readonly MobileChatLaunchCharacterV1[]);
