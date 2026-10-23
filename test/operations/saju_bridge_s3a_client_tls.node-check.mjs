import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyS3aClientTls } from '../../scripts/operations/saju-bridge-s3a-client-tls-check.mjs';

const env = {
  PGSSLMODE: 'verify-full',
  PGSSLROOTCERT: '/runner/temp/cert',
  PGHOST: 'aws-0-ap-southeast-1.pooler.supabase.com',
  PGPORT: '5432',
  PGUSER: 'postgres.cnsfpcdiyofqvhpcegfc',
  PGDATABASE: 'postgres',
  SUPABASE_PROJECT_ID: 'cnsfpcdiyofqvhpcegfc',
};
const connect = tls => `You are connected to database "postgres" as user "postgres.cnsfpcdiyofqvhpcegfc" on host "pooler" at port "5432".\n${tls}\n`;
test('valid libpq verified client-side TLS (v1.2 and v1.3)', () => {
  for (const version of ['TLSv1.2','TLSv1.3']) {
    assert.equal(verifyS3aClientTls(connect(`SSL connection (protocol: ${version}, cipher: TLS_AES_256_GCM_SHA384, compression: off)`), env), true);
  }
});
test('no SSL, obsolete SSL and invalid output fail closed', () => {
  for (const conninfo of [
    connect(''), connect('SSL connection (protocol: TLSv1.0, cipher: TEST, compression: off)'),
    connect('SSL connection (protocol: SSLv3, cipher: TEST, compression: off)'),
    'SSL connection (protocol: TLSv1.3, cipher: X\n',
    ''
  ]) {
    assert.throws(() => verifyS3aClientTls(conninfo,env), /S3A_HOLD_CLIENT_TLS_NOT_PROVEN/);
  }
});
test('relaxed TLS mode, wrong peer/DB and missing CA fail closed', () => {
  for (const [field,value] of [
    ['PGSSLMODE','require'],['PGSSLMODE','verify-ca'],['PGSSLROOTCERT',''],
    ['PGHOST','db.other.supabase.co'],['PGUSER','postgres.other'],
    ['PGDATABASE','tenant'],['PGPORT','6543'],['SUPABASE_PROJECT_ID','other'],
  ]) {
    assert.throws(()=>verifyS3aClientTls(connect('SSL connection (protocol: TLSv1.3, cipher: TEST, compression: off)'), {...env,[field]:value}), /S3A_HOLD_CLIENT_TLS_ENVIRONMENT_MISMATCH/);
  }
});
