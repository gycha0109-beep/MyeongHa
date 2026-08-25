import {
  createImmutableArtifact,
  type RelationshipPolicyV1,
} from '../../domain/src/index.js';

export const DEV_CHARACTER_IDS = Object.freeze([
  'dev-myeong',
  'dev-eop',
  'dev-yeon',
] as const);

export const DEV_RELATIONSHIP_POLICY = createImmutableArtifact<RelationshipPolicyV1>(
  'relationship-policy',
  'dev-v1',
  {
    bounds: {
      closeness: [0, 100],
      trust: [0, 100],
      friction: [0, 100],
    },
    events: [
      {
        event: 'FIRST_MEETING',
        delta: { closeness: 1 },
      },
      {
        event: 'COMPLETED_READING',
        delta: { closeness: 2, trust: 1 },
        transitionTo: 'familiar_visitor',
      },
      {
        event: 'CONFLICT_EVENT',
        delta: { friction: 2 },
      },
    ],
  },
);
