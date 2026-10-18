// Watchtower-Track: security
// Standalone, direct-TLS internal service launcher. Public deployment is still
// HOLD: this starts a LOOPBACK-only socket, never a Vercel Fetch proxy.
import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SeyeonProductionChatGovernorApprovalV1 } from './seyeon-production-governor-factory-v1.js';
import {
  startSeyeonDirectHttpsProductionCompositionV1,
  type CreateSeyeonDirectHttpsProductionCompositionInputV1,
  type SeyeonDirectHttpsProductionCompositionLeaseV1,
} from './seyeon-direct-https-production-composition-v1.js';

export const SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1 = Object.freeze({
  schemaVersion: 'seyeon-direct-https-service-launcher-v1',
  launchArgument: '--internal-zero-source-only',
  bindAddress: '127.0.0.1',
  productionExternalExposureApproved: false,
  automaticPaidActivation: false,
  vercelProxyEnabled: false,
  secretOutput: false,
} as const);

const LAUNCH_ARGUMENT = SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1.launchArgument;
const MAX_CERT_PEM_BYTES = 64 * 1024;
const MAX_KEY_PEM_BYTES = 32 * 1024;
const MAX_APPROVAL_BYTES = 64 * 1024;
const SUPPORTED_ENV_FILES = Object.freeze({
  cert: 'MYEONGHA_SEYEON_DIRECT_TLS_CERT_FILE',
  key: 'MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE',
  policy: 'MYEONGHA_SEYEON_GOVERNOR_APPROVAL_FILE',
  host: 'MYEONGHA_SEYEON_DIRECT_DNS_HOST',
} as const);
type Env = Readonly<Record<string,string | undefined>>;

export class SeyeonDirectHttpsLauncherErrorV1 extends Error {
  constructor(readonly code:
    | 'LAUNCH_SCOPE_INVALID' | 'REQUIRED_SETTING_MISSING'
    | 'UNPROTECTED_SECRET_FILE' | 'INVALID_CERTIFICATE'
    | 'INVALID_GOVERNOR_POLICY', message: string) {
    super(message);
    this.name = 'SeyeonDirectHttpsLauncherErrorV1';
  }
}

function setting(env: Env, key: string): string {
  const val = env[key];
  if (typeof val !== 'string' || val.length === 0 ||
      val.trim() !== val || val.includes('\n') || val.includes('\r')) {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'REQUIRED_SETTING_MISSING', `Missing or invalid direct HTTPS launcher setting ${key}.`,
    );
  }
  return val;
}

function protectedPemOrJsonFile(
  env: Env, envKey: string, maximumBytes: number, allowPublicRead: boolean,
): string {
  const file = setting(env, envKey);
  if (!isAbsolute(file) || file.includes('\0')) {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'UNPROTECTED_SECRET_FILE', 'Direct HTTPS launcher requires an absolute file path.',
    );
  }
  // O_NOFOLLOW + fstat on the OPEN descriptor prevents a symlink swap
  // between validating permissions and reading private material.
  if (lstatSync(file).isSymbolicLink()) {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'UNPROTECTED_SECRET_FILE', 'Direct HTTPS launcher refuses symbolic links.',
    );
  }
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stats = fstatSync(fd);
    if (!stats.isFile() ||
        stats.size < 1 || stats.size > maximumBytes ||
        (!allowPublicRead && process.platform !== 'win32' && (stats.mode & 0o077) !== 0) ||
        (typeof process.getuid === 'function' && !allowPublicRead &&
         stats.uid !== process.getuid())) {
      throw new SeyeonDirectHttpsLauncherErrorV1(
        'UNPROTECTED_SECRET_FILE', 'Direct HTTPS launcher rejected unprotected or oversized TLS/governor material.',
      );
    }
    return readFileSync(fd, 'utf8');
  } finally {
    closeSync(fd);
  }
}

function validateTlsPair(input: {
  readonly cert: string;
  readonly key: string;
  readonly expectedDnsHost: string;
}): void {
  try {
    const certificate = new X509Certificate(input.cert);
    if (certificate.checkHost(input.expectedDnsHost) !== input.expectedDnsHost ||
        Date.parse(certificate.validFrom) > Date.now() ||
        Date.parse(certificate.validTo) <= Date.now()) {
      throw new Error('Certificate scope or validity invalid.');
    }
    const publicKey = createPublicKey(createPrivateKey(input.key));
    if (!publicKey.export({type:'spki',format:'der'}).equals(
      certificate.publicKey.export({type:'spki',format:'der'}),
    )) {
      throw new Error('TLS certificate and private key mismatch.');
    }
  } catch {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'INVALID_CERTIFICATE', 'Direct HTTPS certificate, private key or DNS scope invalid.',
    );
  }
}

export type SeyeonDirectHttpsLauncherOptionsV1 = Pick<
  CreateSeyeonDirectHttpsProductionCompositionInputV1,
  'env' | 'certificatePem' | 'privateKeyPem' | 'expectedDnsHost' | 'governorApproval'
>;

/**
 * Read files owned by the operator, from protected absolute filesystem paths.
 * Never read secrets from HTTP, CLI args, .env files, Vercel, or stdout.
 * Accepts EXACTLY one internal-only flag; "--public" cannot enable exposure.
 */
export function prepareSeyeonDirectHttpsLauncherOptionsV1(input: {
  readonly env: Env;
  readonly args: readonly string[];
}): SeyeonDirectHttpsLauncherOptionsV1 {
  if (input.args.length !== 1 || input.args[0] !== LAUNCH_ARGUMENT) {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'LAUNCH_SCOPE_INVALID', 'External Se-yeon HTTPS activation is not approved.',
    );
  }
  const expectedDnsHost = setting(input.env, SUPPORTED_ENV_FILES.host);
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/u.test(expectedDnsHost) ||
      expectedDnsHost.length > 253 || expectedDnsHost.includes('..') ||
      expectedDnsHost.includes(':')) {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'REQUIRED_SETTING_MISSING', 'Direct HTTPS requires one exact server-owned DNS host.',
    );
  }
  const cert = protectedPemOrJsonFile(input.env, SUPPORTED_ENV_FILES.cert, MAX_CERT_PEM_BYTES, true);
  const key = protectedPemOrJsonFile(input.env, SUPPORTED_ENV_FILES.key, MAX_KEY_PEM_BYTES, false);
  validateTlsPair({cert,key,expectedDnsHost});

  let governorApproval: SeyeonProductionChatGovernorApprovalV1;
  try {
    const content = protectedPemOrJsonFile(
      input.env, SUPPORTED_ENV_FILES.policy, MAX_APPROVAL_BYTES, false,
    );
    const json = JSON.parse(content) as unknown;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Invalid policy document');
    }
    governorApproval = json as SeyeonProductionChatGovernorApprovalV1;
  } catch {
    throw new SeyeonDirectHttpsLauncherErrorV1(
      'INVALID_GOVERNOR_POLICY', 'Governed production policy must be a protected, valid JSON object.',
    );
  }
  return Object.freeze({
    env: input.env,
    certificatePem: cert,
    privateKeyPem: key,
    expectedDnsHost,
    governorApproval,
  });
}

export async function startSeyeonDirectHttpsServiceFromFilesV1(input: {
  readonly env: Env;
  readonly args: readonly string[];
}): Promise<SeyeonDirectHttpsProductionCompositionLeaseV1> {
  const options = prepareSeyeonDirectHttpsLauncherOptionsV1(input);
  return startSeyeonDirectHttpsProductionCompositionV1(options);
}

/**
 * Node 24 compiled executable:
 * node dist/apps/api/src/seyeon-direct-https-service-launcher-v1.js --internal-zero-source-only
 *
 * NOT an external deployment. No auto-start on npm install/build/import.
 */
export async function runSeyeonDirectHttpsServiceProcessV1(input: {
  readonly env: Env;
  readonly args: readonly string[];
}): Promise<void> {
  const service = await startSeyeonDirectHttpsServiceFromFilesV1(input);
  process.stdout.write(JSON.stringify({
    schemaVersion: SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1.schemaVersion,
    transport: 'direct-tls-loopback',
    host: '127.0.0.1',
    port: service.port,
    exposure: 'internal-only',
  }) + '\n');

  let stopping: Promise<void> | undefined;
  const stop = (): void => {
    stopping ??= service.close();
    void stopping.catch(() => {
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const invoked = typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  void runSeyeonDirectHttpsServiceProcessV1({
    env: process.env, args: process.argv.slice(2),
  }).catch(error => {
    // Do not print exception messages, DSNs, certificate/key material or
    // Provider/Supabase errors to startup logs.
    process.stderr.write(JSON.stringify({
      schemaVersion: SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1.schemaVersion,
      outcome: 'launch_denied',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }) + '\n');
    process.exitCode = 1;
  });
}
