export type ThreeDivisionKey = 'upper' | 'middle' | 'lower';

export type ThreeDivisionRelativeClass =
  | 'upper_longest'
  | 'middle_longest'
  | 'lower_longest'
  | 'upper_middle_tie_longest'
  | 'upper_lower_tie_longest'
  | 'middle_lower_tie_longest'
  | 'all_equal_exact';

export interface ThreeDivisionLengths {
  readonly upper: number;
  readonly middle: number;
  readonly lower: number;
}

export interface ThreeDivisionRelativeEvaluation {
  readonly relation: ThreeDivisionRelativeClass;
  readonly normalizedShares: Readonly<Record<ThreeDivisionKey, number>>;
  readonly totalLength: number;
  readonly calibrationApplied: false;
  readonly nearEqualClassificationAvailable: false;
}

function assertPositiveFinite(value: number, key: ThreeDivisionKey): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`three_divisions_invalid_length:${key}`);
  }
}

export function evaluateThreeDivisionRelativeOrder(
  lengths: ThreeDivisionLengths,
): ThreeDivisionRelativeEvaluation {
  assertPositiveFinite(lengths.upper, 'upper');
  assertPositiveFinite(lengths.middle, 'middle');
  assertPositiveFinite(lengths.lower, 'lower');

  const totalLength = lengths.upper + lengths.middle + lengths.lower;
  const max = Math.max(lengths.upper, lengths.middle, lengths.lower);
  const upperIsMax = lengths.upper === max;
  const middleIsMax = lengths.middle === max;
  const lowerIsMax = lengths.lower === max;

  let relation: ThreeDivisionRelativeClass;
  if (upperIsMax && middleIsMax && lowerIsMax) relation = 'all_equal_exact';
  else if (upperIsMax && middleIsMax) relation = 'upper_middle_tie_longest';
  else if (upperIsMax && lowerIsMax) relation = 'upper_lower_tie_longest';
  else if (middleIsMax && lowerIsMax) relation = 'middle_lower_tie_longest';
  else if (upperIsMax) relation = 'upper_longest';
  else if (middleIsMax) relation = 'middle_longest';
  else relation = 'lower_longest';

  return Object.freeze({
    relation,
    normalizedShares: Object.freeze({
      upper: lengths.upper / totalLength,
      middle: lengths.middle / totalLength,
      lower: lengths.lower / totalLength,
    }),
    totalLength,
    calibrationApplied: false,
    nearEqualClassificationAvailable: false,
  });
}
