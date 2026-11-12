import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async path => readFile(path, 'utf8');
const observation = JSON.parse(await read(
  'docs/operations/POSTGRES_REPOSITORY_ONLY_COMMERCE_LIVE_EFFECT_20261107.json',
));
const disposition = JSON.parse(await read(
  'docs/operations/POSTGRES_REPOSITORY_ONLY_VERSION_DISPOSITION_20261107.json',
));
const sql = await read('scripts/operations/production-repository-only-commerce-effect-readonly.sql');
const expected = [
  ['1780', 'function', 'cmd_apply_verified_portone_reader_full_cancellation_v1'],
  ['20261027054525', 'table', 'digital_reading_checkout_notice_revisions_v1'],
  ['20261027054525', 'table', 'digital_reading_checkout_notice_presentations_v1'],
  ['20261027054525', 'table', 'digital_reading_checkout_notice_acknowledgments_v1'],
  ['20261027054525', 'function', 'ct_validate_digital_checkout_notice_presentation_v1'],
  ['20261027054525', 'function', 'ct_validate_digital_checkout_notice_acknowledgment_v1'],
  ['20261027054525', 'function', 'tr_digital_checkout_notice_immutable_v1'],
  ['20261027054525', 'trigger', 'ct_digital_checkout_notice_presentation_v1'],
  ['20261027054525', 'trigger', 'ct_digital_checkout_notice_acknowledgment_v1'],
  ['20261027054525', 'trigger', 'tr_digital_checkout_notice_revision_immutable_v1'],
  ['20261027054525', 'trigger', 'tr_digital_checkout_notice_presentation_immutable_v1'],
  ['20261027054525', 'trigger', 'tr_digital_checkout_notice_ack_immutable_v1'],
];
assert.equal(observation.schemaVersion, 'myeongha-ops-phase8-repository-only-commerce-live-effect-v1');
assert.equal(observation.observedObjects.length, expected.length);
assert.equal(observation.productionMigrationFrontier, '20261105075227');
assert.equal(observation.productionAppliedMigrationCount, 241);
assert.equal(observation.drReady, false);
assert.equal(observation.serviceResumptionAllowed, false);
assert.deepEqual(
  [...observation.observedObjects.map(x => [x.sourceVersion, x.kind, x.name].join(':'))].sort(),
  [...expected.map(x => x.join(':'))].sort(),
);
for (const [version, kind, name] of expected) {
  const row = observation.observedObjects.find(x =>
    x.sourceVersion === version && x.kind === kind && x.name === name);
  assert.equal(row.exactSourceVersionInLedger, false);
  assert.equal(row.currentNamedObjectMatches, 0);
  assert.ok(sql.includes(name), 'missing exact SQL target: ' + name);
  assert.ok(disposition.entries.some(x => x.repositoryVersion === version),
    'not a cataloged repository-only version: ' + version);
}
const sqlNormalized = sql.replace(/--[^\n]*/g, '');
assert.match(sqlNormalized, /\bFROM\s+expected\s+e\s+ORDER BY\b/iu);
assert.doesNotMatch(sqlNormalized, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\s+(?:TABLE|FUNCTION|ROLE|POLICY|INTO|ON|FROM|\w)/iu);
for (const version of ['1780', '20261027054525']) {
  const sources = observation.migrationSqlFiles.filter(p => p.split('/').at(-1).startsWith(version + '_'));
  assert.equal(sources.length, 1);
  const contents = await read(sources[0]);
  for (const [, kind, name] of expected.filter(row => row[0] === version)) {
    const re = kind === 'trigger'
      ? new RegExp('\\bcreate\\s+trigger\\s+' + name + '\\b', 'iu')
      : new RegExp('\\bcreate\\s+(?:or\\s+replace\\s+)?' + kind + '\\s+(?:public\\.)?' + name + '\\b', 'iu');
    assert.match(contents, re, 'source does not declare object: ' + name);
  }
}
console.log('Phase 8-A Commerce source/live metadata evidence PASS: 12 named objects absent; versions absent; DR stays BLOCKED.');
