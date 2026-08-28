export type NeutralAnchorConsumerSlotV1 =
  | 'neutral.face.brow_midline'
  | 'neutral.face.nose_region'
  | 'neutral.face.left_brow_region'
  | 'neutral.face.right_brow_region'
  | 'neutral.face.left_eye_region'
  | 'neutral.face.right_eye_region';

export const FR14_NEUTRAL_BINDING_PROFILE_VERSION = '0.1.0' as const;

export const FR14_NEUTRAL_CONSUMER_SLOTS: readonly NeutralAnchorConsumerSlotV1[] = Object.freeze([
  'neutral.face.brow_midline',
  'neutral.face.nose_region',
  'neutral.face.left_brow_region',
  'neutral.face.right_brow_region',
  'neutral.face.left_eye_region',
  'neutral.face.right_eye_region',
] as const);
