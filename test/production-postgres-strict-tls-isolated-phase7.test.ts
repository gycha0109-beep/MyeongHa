import { execFile as execFileCallback } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  buildProductionPostgresStrictTlsTargetV1,
  PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
  PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
} from '../apps/api/src/production-postgres-tls-peer-verification.js';
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from '../apps/api/src/production-user-data-runtime-config.js';

const execFile = promisify(execFileCallback);
const pgBin = process.env.PG_BIN_DIR;
const opensslBin = process.env.OPENSSL_BIN;
const extension = process.platform === 'win32' ? '.exe' : '';
const ADMIN = 'myeongha_phase7_tls_builder_admin';
const USER = 'myeongha_phase7_tls_builder_login';
const PASSWORD = 'synthetic-ephemeral-password';
const isolated = pgBin && opensslBin ? describe : describe.skip;

async function command(file: string, args: string[], withPgPath = false) {
  return execFile(file, args, {
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      ...(withPgPath && pgBin
        ? { PATH: pgBin + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '') }
        : {}),
    },
  });
}
async function postgres(commandName: string, args: string[]) {
  if (!pgBin) throw Error('Missing isolated PostgreSQL binaries');
  return command(join(pgBin, commandName + extension), args, true);
}
async function randomLoopbackPort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    socket.once('listening', resolve);
    socket.once('error', reject);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') throw Error('No loopback port');
  await new Promise<void>((resolve, reject) =>
    socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}
async function queryFrom(target: ReturnType<typeof buildProductionPostgresStrictTlsTargetV1>) {
  const pool = new Pool({
    connectionString: target.connectionString,
    ssl: target.ssl,
    max: 1, connectionTimeoutMillis: 3000, allowExitOnIdle: true,
  });
  try {
    return await pool.query(
      'SELECT (SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls, current_user',
    );
  } finally {
    await pool.end();
  }
}

isolated('Production strict TLS target builder against isolated real PostgreSQL', () => {
  it('enforces a dynamic synthetic CA fingerprint and supports a verified actual SQL connection', async () => {
    if (!opensslBin) throw Error('Missing isolated OpenSSL');
    const dir = await mkdtemp(join(tmpdir(), 'myeongha-phase7-strict-tls-'));
    const dataDir = join(dir, 'cluster');
    const cert = join(dir, 'server.crt');
    const key = join(dir, 'server.key');
    const rogueCert = join(dir, 'rogue.crt');
    const rogueKey = join(dir, 'rogue.key');
    const log = join(dir, 'pg.log');
    let started = false;
    let admin: Pool | undefined;
    try {
      await postgres('initdb', [
        '-D', dataDir, '-U', ADMIN, '--auth-host=trust', '--auth-local=trust',
        '--encoding=UTF8', '--no-sync', '--no-instructions',
      ]);
      await command(opensslBin, [
        'req','-x509','-newkey','rsa:2048','-nodes',
        '-keyout',key,'-out',cert,'-days','1',
        '-subj','/CN=synthetic-localhost',
        '-addext','subjectAltName=DNS:localhost,IP:127.0.0.1',
      ]);
      await command(opensslBin, [
        'req','-x509','-newkey','rsa:2048','-nodes',
        '-keyout',rogueKey,'-out',rogueCert,'-days','1',
        '-subj','/CN=synthetic-rogue',
      ]);

      const hba = join(dataDir, 'pg_hba.conf');
      await writeFile(hba, [
        'hostssl all ' + USER + ' 127.0.0.1/32 trust',
        'hostnossl all ' + USER + ' 127.0.0.1/32 reject',
        await readFile(hba, 'utf8'),
      ].join('\n'), 'utf8');
      const port = await randomLoopbackPort();
      await postgres('pg_ctl', [
        '-D', dataDir, '-l', log, '-o',
        [
          '-h 127.0.0.1',
          '-p ' + port,
          '-c ssl=on',
          '-c ssl_cert_file=' + cert.replaceAll('\\', '/'),
          '-c ssl_key_file=' + key.replaceAll('\\', '/'),
          '-c listen_addresses=127.0.0.1',
        ].join(' '),
        '-w', '-t', '20', 'start',
      ]);
      started = true;
      admin = new Pool({
        host: '127.0.0.1', port, database: 'postgres', user: ADMIN,
        ssl: false, max: 1, connectionTimeoutMillis: 3000,
      });
      await admin.query('CREATE ROLE ' + USER + ' LOGIN NOSUPERUSER NOBYPASSRLS');
      await admin.end();
      admin = undefined;

      const pem = await readFile(cert, 'utf8');
      const differentPem = await readFile(rogueCert, 'utf8');
      const fingerprint = new X509Certificate(pem).fingerprint256;
      const authority = {
        contractVersion: PRODUCTION_POSTGRES_TLS_PEER_VERIFICATION_CONTRACT_VERSION_V1,
        projectRef: MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF,
        requiredTlsMode: PRODUCTION_POSTGRES_TLS_REQUIRED_MODE_V1,
        rootCertificateFingerprint256: fingerprint,
      };
      const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/postgres?sslmode=verify-full`;
      const verified = buildProductionPostgresStrictTlsTargetV1({
        databaseUrl: url, rootCertificatePem: pem, authority,
      });
      expect(new URL(verified.connectionString).searchParams.has('sslmode')).toBe(false);
      expect(verified.ssl).toMatchObject({ rejectUnauthorized: true });
      expect(verified.ssl).not.toHaveProperty('checkServerIdentity');
      expect(verified.evidence.rootCertificatePinned).toBe(true);
      expect(verified.evidence.rootCertificateFingerprint256).toBe(fingerprint);
      const query = await queryFrom(verified);
      expect(query.rows).toEqual([{ tls: true, current_user: USER }]);

      expect(() => buildProductionPostgresStrictTlsTargetV1({
        databaseUrl: url, rootCertificatePem: differentPem, authority,
      })).toThrow(expect.objectContaining({ code: 'ROOT_CERTIFICATE_FINGERPRINT_MISMATCH' }));
      expect(() => buildProductionPostgresStrictTlsTargetV1({
        databaseUrl: url.replace('sslmode=verify-full', 'sslmode=require'),
        rootCertificatePem: pem, authority,
      })).toThrow(expect.objectContaining({ code: 'TLS_MODE_NOT_VERIFY_FULL' }));
      expect(() => buildProductionPostgresStrictTlsTargetV1({
        databaseUrl: url + '&sslrootcert=override',
        rootCertificatePem: pem, authority,
      })).toThrow(expect.objectContaining({ code: 'AMBIGUOUS_SSL_CONFIGURATION' }));

      const rogueAuthority = {
        ...authority,
        rootCertificateFingerprint256: new X509Certificate(differentPem).fingerprint256,
      };
      const rogueTarget = buildProductionPostgresStrictTlsTargetV1({
        databaseUrl: url, rootCertificatePem: differentPem, authority: rogueAuthority,
      });
      await expect(queryFrom(rogueTarget)).rejects.toMatchObject({
        code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
      });

      console.log('MYEONGHA_PRODUCTION_TLS_BUILDER_ISOLATED_PASS', JSON.stringify({
        target: 'ephemeral-postgresql18-localhost',
        realTlsSql: true,
        syntheticFingerprintMatched: true,
        mismatchedFingerprintRejectedBeforeConnect: true,
        unsafeSslModesRejected: true,
        untrustedCaRejectedByDriver: true,
        realProductionPinnedRootProven: false,
        productionPg17Proven: false,
      }));
    } finally {
      await admin?.end().catch(() => undefined);
      if (started) {
        await postgres('pg_ctl', [
          '-D', dataDir, '-m', 'immediate', '-w', '-t', '20', 'stop',
        ]).catch(() => undefined);
      }
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }, 90_000);
});
