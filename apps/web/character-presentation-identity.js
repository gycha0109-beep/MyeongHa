const CHARACTER_PRESENTATION_BY_ID_V1 = Object.freeze({
  seyeon: Object.freeze({ presentationKey: 'seyeon', name: '세연', title: '명하의 안내인' }),
  yeoul: Object.freeze({ presentationKey: 'yeoul', name: '여울', title: '운영관리팀 사원' }),
  seorin: Object.freeze({ presentationKey: 'seorin', name: '서린', title: '기억 서고지기' }),
  rahyeon: Object.freeze({ presentationKey: 'rahyeon', name: '라현', title: '전시 기획자' }),
  mira: Object.freeze({ presentationKey: 'mira', name: '미라', title: '연결자' }),
  taegyeom: Object.freeze({ presentationKey: 'taegyeom', name: '태겸', title: '프로 격구 선수' }),
  yunho: Object.freeze({ presentationKey: 'yunho', name: '윤호', title: '연결자' }),
  doyun: Object.freeze({ presentationKey: 'doyun', name: '도윤', title: '연결자' }),
  baekheon: Object.freeze({ presentationKey: 'baekheon', name: '백헌', title: '베테랑 조정자' }),
});

export const CANONICAL_CHARACTER_IDS_V1 = Object.freeze(Object.keys(CHARACTER_PRESENTATION_BY_ID_V1));

export function resolveCanonicalCharacterPresentationV1(characterId) {
  if (typeof characterId !== 'string') return null;
  const normalized = characterId.trim().toLowerCase();
  return Object.hasOwn(CHARACTER_PRESENTATION_BY_ID_V1, normalized)
    ? CHARACTER_PRESENTATION_BY_ID_V1[normalized]
    : null;
}

export function resolveCanonicalCharacterPresentationKeyV1(characterId) {
  return resolveCanonicalCharacterPresentationV1(characterId)?.presentationKey ?? null;
}
