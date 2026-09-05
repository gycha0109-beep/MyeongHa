export type CharacterConceptV1NameStatus = 'working' | 'temporary';

/**
 * Source-backed Character Concept V1 roster entry.
 *
 * This is intentionally not a CharacterContentDefinition. The source fixes the
 * current working roster and relationship-fantasy direction, but explicitly does
 * not establish final immutable names / detailed canon. No canonical characterId
 * is present here by design.
 */
export interface CharacterConceptV1WorkingRosterEntry {
  readonly workingDisplayName: string;
  readonly nameStatus: CharacterConceptV1NameStatus;
  readonly relationshipFantasy: string;
  readonly relationshipHook: string;
  readonly sourceStatus: 'character_concept_v1_working';
  readonly immutableCanonStatus: 'not_established';
  readonly productionPublication: 'blocked';
}

const workingEntry = (
  workingDisplayName: string,
  relationshipFantasy: string,
  relationshipHook: string,
  nameStatus: CharacterConceptV1NameStatus = 'working',
): CharacterConceptV1WorkingRosterEntry => ({
  workingDisplayName,
  nameStatus,
  relationshipFantasy,
  relationshipHook,
  sourceStatus: 'character_concept_v1_working',
  immutableCanonStatus: 'not_established',
  productionPublication: 'blocked',
});

/**
 * Exact current Character Concept V1 working roster.
 *
 * `working` is not immutable-name approval. `미라` is explicitly temporary in
 * source. The entire structure is Production-ineligible until separately governed
 * immutable Character authority exists.
 */
export const CHARACTER_CONCEPT_V1_WORKING_ROSTER = [
  workingEntry(
    '세연',
    'First Companion / 정실감 / 소꿉친구적 순애',
    '돌아오면 얘가 있을 것 같다.',
  ),
  workingEntry(
    '여울',
    '호감 부정 / 질투 / 숨길 수 없는 관심',
    '신경 쓰는 게 너무 티 나는데 본인만 아니라고 우기는 여자.',
  ),
  workingEntry(
    '서린',
    '오래 기억해주는 사람 / 잔잔하고 깊은 관계',
    '이 사람은 내가 한 말을 정말 기억한다.',
  ),
  workingEntry(
    '라현',
    '성숙한 매혹 / 주도권 / 심리전',
    '이 사람한테 휘말리고 싶다.',
  ),
  workingEntry(
    '미라',
    '잘생긴 여자 / 무심다정 / Friends-to-Lovers',
    '너무 자연스럽게 가까워서 사랑인지도 몰랐던 잘생긴 여자.',
    'temporary',
  ),
  workingEntry(
    '태겸',
    '냉미남 / 마찰 / 인정받는 관계',
    '저 인간한테 인정받고 싶다.',
  ),
  workingEntry(
    '윤호',
    '다정남 / 생활형 안정 / 안경 너드 미남',
    '누군가에게 편하게 기대고 싶다.',
  ),
  workingEntry(
    '도윤',
    '능글 / 아웃사이더 / 공범 / 선택적 특별취급',
    '왜 나한테만 이러지?',
  ),
  workingEntry(
    '백헌',
    '연상 / 베테랑 / 으른섹시 / 능력에서 오는 안정',
    '흔들리지 않는 어른의 사적인 얼굴을 보고 싶다.',
  ),
] as const satisfies readonly CharacterConceptV1WorkingRosterEntry[];

export const CHARACTER_CONCEPT_V1_WORKING_ROSTER_SIZE = 9 as const;
