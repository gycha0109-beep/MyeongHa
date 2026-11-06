import { expect, it } from 'vitest';
import { compareMigrationCatalogs } from '../../scripts/operations/compare-postgres-migration-catalog-readonly.mjs';

const main = 'a'.repeat(40);
const row = (version, name) => ({ version, name });

it('separates exact version identity, numeric frontier and unique same-name candidates', () => {
  const result = compareMigrationCatalogs([
    row('0984', 'legacy'), row('2320', 'legacy-later'), row('20261029012948', 'candidate'),
    row('20261105075227', 'remote-only'), row('20261029145500', 'name-on-remote'),
  ], [
    row('0984', 'legacy'), row('2320', 'legacy-later'), row('20261029012000', 'candidate'),
    row('20261029185500', 'repo-only'), row('20261029145500', 'name-in-repo'),
  ], main);
  expect(result).toMatchObject({
    latestRemoteVersion: '20261105075227', latestRepositoryVersion: '20261029185500',
    sameVersionNameDiffers: ['20261029145500'],
    sameNameDifferentVersion: [{ remoteVersion: '20261029012948', repositoryVersion: '20261029012000' }],
    catalogStatus: 'DIFFERENCES_REQUIRE_REVIEW',
    appliedSqlEquivalenceProven: false, hostedRestoreProven: false, drReady: false,
  });
  expect(JSON.stringify(result)).not.toContain('name-on-remote');
});

it('does not pair ambiguous names or collapse distinct legacy version strings', () => {
  const result = compareMigrationCatalogs([row('0098', 'legacy'), row('0099', 'repeat')],
    [row('98', 'legacy'), row('0100', 'repeat'), row('0101', 'repeat')], main);
  expect(result.remoteOnly).toEqual(['0098', '0099']);
  expect(result.repositoryOnly).toEqual(['98', '0100', '0101']);
  expect(result.sameNameDifferentVersion).toEqual([{ remoteVersion: '0098', repositoryVersion: '98' }]);
});

it('rejects duplicate versions, payload fields and unresolved source SHAs', () => {
  const catalog = [row('20261105075227', 'one')];
  expect(() => compareMigrationCatalogs([...catalog, ...catalog], catalog, main)).toThrow();
  expect(() => compareMigrationCatalogs([{ ...catalog[0], statements: [] }], catalog, main)).toThrow();
  expect(() => compareMigrationCatalogs(catalog, catalog, 'main')).toThrow();
  expect(compareMigrationCatalogs(catalog, catalog, main)).toMatchObject({
    catalogStatus: 'VERSION_CATALOG_MATCH',
    appliedSqlEquivalenceProven: false,
    hostedRestoreProven: false,
    drReady: false,
    serviceResumptionAllowed: false,
  });
});
