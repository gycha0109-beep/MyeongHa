// Verify the TLS session seen by libpq/psql, not the PostgreSQL backend hop.
// Supabase's Session Pooler may terminate client TLS before pg_stat_ssl.
// Never echo \conninfo text: it contains internal database routing metadata.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function verifyS3aClientTls(conninfo, env = process.env) {
  if (env.PGSSLMODE !== 'verify-full' || !env.PGSSLROOTCERT ||
      env.PGPORT !== '5432' || env.PGDATABASE !== 'postgres' ||
      env.SUPABASE_PROJECT_ID !== 'cnsfpcdiyofqvhpcegfc' ||
      env.PGUSER !== 'postgres.cnsfpcdiyofqvhpcegfc' ||
      !/^[a-z0-9-]+(?:[.][a-z0-9-]+)*[.]pooler[.]supabase[.]com$/u.test(env.PGHOST ?? '')) {
    throw new Error('S3A_HOLD_CLIENT_TLS_ENVIRONMENT_MISMATCH');
  }
  if (typeof conninfo !== 'string' ||
      !/\bSSL connection \(protocol: TLSv1\.(?:2|3), cipher: [^\r\n)]+\)/u.test(conninfo)) {
    throw new Error('S3A_HOLD_CLIENT_TLS_NOT_PROVEN');
  }
  return true;
}

async function main() {
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 16_384) {
      throw new Error('S3A_HOLD_CLIENT_TLS_OUTPUT_TOO_LARGE');
    }
  }
  verifyS3aClientTls(value);
  console.log('s3a_libpq_client_tls=verified_full_chain_and_hostname');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error && /^S3A_HOLD_CLIENT_TLS_/.test(error.message)
      ? error.message : 'S3A_HOLD_CLIENT_TLS_UNEXPECTED_ERROR');
    process.exitCode = 1;
  });
}
