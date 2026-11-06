import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves the current read-only Saju Cloud Run traffic and revision lineage without authorizing rollback', () => {
  const bytes = readFileSync('docs/operations/SAJU_CLOUD_RUN_LINEAGE_OBSERVATION_20261106.json');
  expect(bytes.length).toBe(39017);
  expect(createHash('sha256').update(bytes).digest('hex'))
    .toBe('bc17711444e997bb7ed1494d001637d9fc765f504d0eea26281416b705abc6e6');

  const evidence = JSON.parse(bytes);
  expect(evidence).toMatchObject({
    schemaVersion: 1,
    target: {
      projectId: 'myeongha',
      region: 'asia-southeast1',
      service: 'saju-production',
      latestCreatedRevisionName: 'saju-production-00013-lar',
      latestReadyRevisionName: 'saju-production-00013-lar',
      activeTraffic: [{
        revisionName: 'saju-production-00013-lar',
        percent: 100,
        tag: 'candidate-54667c70e461',
        latestRevision: false,
      }],
    },
    auditHistory: {
      freshnessDays: 30,
      limit: 500,
      readable: true,
      category: 'readable',
      rawProviderDataRetained: false,
    },
    classification: {
      revisionInventoryCount: 10,
      selectedTrafficEventCount: 54,
      singleActiveRevisionAt100Percent: true,
      rollbackTargetAuthorized: false,
      predecessorInferenceFromRevisionOrderingAllowed: false,
    },
  });
  const active = evidence.revisionInventory.find((revision) =>
    revision.name === 'saju-production-00013-lar');
  expect(active).toMatchObject({
    imageRef: 'asia-southeast1-docker.pkg.dev/myeongha/myeongha/saju-production@sha256:a911e244d91fd03b72cf94553c90cf72cc2bbb51a9b82255fb45379e53c37d67',
    ready: 'True',
  });
});
