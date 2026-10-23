/** Browser Reader presentation parity only. Never treat this as a Reader grant. */
export const MOBILE_READER_PRESENTATIONS_V1 = Object.freeze([
  Object.freeze({ key: 'seyeon', name: '세연', title: '명하의 안내인', tone: '부드럽게 흐름을 풀어 설명합니다.' }),
  Object.freeze({ key: 'baekheon', name: '백헌', title: '베테랑 조정자', tone: '구조와 선택을 단정하게 짚습니다.' }),
  Object.freeze({ key: 'yeoul', name: '여울', title: '운영관리팀 사원', tone: '돌려 말하지 않고 필요한 지점부터 봅니다.' }),
  Object.freeze({ key: 'seorin', name: '서린', title: '기억 서고지기', tone: '과거의 반복과 지금의 흐름을 연결해 봅니다.' }),
  Object.freeze({ key: 'rahyeon', name: '라현', title: '전시 기획자', tone: '겉보다 실제로 흔들리는 지점을 읽습니다.' }),
  Object.freeze({ key: 'mira', name: '미라', title: '연결자', tone: '과장 없이 지금 쓸 수 있는 정보부터 봅니다.' }),
  Object.freeze({ key: 'taegyeom', name: '태겸', title: '프로 격구 선수', tone: '낙관보다 확인되는 구조와 행동을 봅니다.' }),
  Object.freeze({ key: 'yunho', name: '윤호', title: '연결자', tone: '구조와 시기를 차례대로 정리합니다.' }),
  Object.freeze({ key: 'doyun', name: '도윤', title: '연결자', tone: '복잡한 설명보다 걸리는 부분부터 시작합니다.' }),
] as const);

/** Presentation-only mobile launch filter; not a paid Reader-eligibility mutation. */
export const MOBILE_READER_VISIBLE_LAUNCH_PRESENTATIONS_V1 = Object.freeze(
  MOBILE_READER_PRESENTATIONS_V1.filter(
    ({ key }) => key !== 'seorin' && key !== 'mira' && key !== 'doyun',
  ),
);

export type MobileReaderPresentationIdV1 =
  (typeof MOBILE_READER_PRESENTATIONS_V1)[number]['key'];

export function findMobileReaderPresentationV1(id: MobileReaderPresentationIdV1) {
  return MOBILE_READER_PRESENTATIONS_V1.find((reader) => reader.key === id)
    ?? MOBILE_READER_PRESENTATIONS_V1[0];
}

/**
 * Mobile mirrors Web's first Reader Preview candidate.
 * This is not a server Reader grant or paid interpretation activation.
 */
export const MOBILE_READER_PREVIEW_CANDIDATE_IDS_V1 = Object.freeze(['seyeon'] as const);
export const MOBILE_READER_INTERPRETATION_PUBLIC_V1 = false;

export function isMobileReaderPreviewSelectableV1(id: MobileReaderPresentationIdV1): boolean {
  return MOBILE_READER_PREVIEW_CANDIDATE_IDS_V1.some((candidate) => candidate === id);
}
