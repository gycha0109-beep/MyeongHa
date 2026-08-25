import type { RelationshipPolicy } from '../../domain/src/index.js';

export const DEV_CHARACTER_IDS: readonly string[] = [
  'john-doe-01',
  'john-doe-02',
  'john-doe-03',
  'john-doe-04',
  'john-doe-05',
];

export const DEV_RELATIONSHIP_POLICY: RelationshipPolicy = {
  policyVersion: 'dev-v1',
  policyContentHash: 'sha256:v1:dev-placeholder-policy',
  rules: {
    COMPLETED_READING: {
      closeness: 2,
      trust: 1,
      friction: 0,
      nextStage: 'familiar_visitor',
    },
  },
};
