import {
  createImmutableArtifact,
  type RelationshipPolicyV1,
} from '../../domain/src/index.js';

export const DEV_CHARACTER_IDS: readonly string[] = [
  'john-doe-01',
  'john-doe-02',
  'john-doe-03',
  'john-doe-04',
  'john-doe-05',
];

const DEV_RELATIONSHIP_POLICY_PAYLOAD: RelationshipPolicyV1 = {
  bounds: {
    closeness: [0, 100],
    trust: [0, 100],
    friction: [0, 100],
  },
  events: [
    {
      event: 'COMPLETED_READING',
      delta: { closeness: 2, trust: 1, friction: 0 },
      transitionTo: 'familiar_visitor',
    },
  ],
};

export const DEV_RELATIONSHIP_POLICY = createImmutableArtifact(
  'relationship-policy',
  'dev-v1',
  DEV_RELATIONSHIP_POLICY_PAYLOAD,
);
