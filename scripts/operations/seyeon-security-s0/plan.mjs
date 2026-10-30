// Watchtower-Track: security
// Pure source plan. Hashes bind SQL files, never owner approval.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SEYEON_SECURITY_S0_SQL_SOURCES = Object.freeze([
  '../seyeon-private-memory-grant-revoke-r17-candidate.sql',
  '00-original-source-locks.sql', '01-source-pin.sql', '02-atomic-commit.sql',
  '03-private-memory-accept.sql', '04-locked-reveal.sql', '05-http-delivery-receipt.sql',
  '06-attempt-receipt-progression.sql', '07-member-withdrawal-status.sql',
  '08-historical-thread-presence.sql', '09-owned-original-memory-grant.sql',
  '13-g0-current-original-lineage-context.sql',
  '10-planner-memory-decision-source.sql',
  '11-planner-memory-proposal-producer.sql',
  '12-planner-memory-non-durable-decision.sql',
]);

export async function buildSeyeonSecurityS0InstallationPlan() {
  const describe = async source => {
    const normalized = (await readFile(new URL(source, import.meta.url), 'utf8')).replace(/\r\n/gu, '\n');
    return { source, sha256LfUtf8: createHash('sha256').update(normalized).digest('hex'),
      bytesLfUtf8: Buffer.byteLength(normalized, 'utf8') };
  };
  return {
    schemaVersion: 'seyeon-security-s0-installation-plan-v2',
    scope: 'one-original-conversation-recall-memory',
    installerMayActivateProduction: false, automaticMigration: false,
    defaultModelUseEnabled: false, defaultWritableEnabled: false,
    positiveApiExecuteGranted: false, externalProxyRevealEnabledByInstaller: false,
    files: await Promise.all(SEYEON_SECURITY_S0_SQL_SOURCES.map(describe)),
    stop: await describe('stop-positive-use.sql'),
    stopPreservesConsentWithdrawal: true,
    remainingReleaseEvidence: [
      'PG17 original Grant/Commit/Reveal and durable receipt race',
      'approved governed budget and dedicated DB role',
      'same-backup isolated restore and RPO/RTO',
      'target HTTP receipt/source-invalidation evidence', 'G6 bounded authenticated Production smoke',
    ],
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(JSON.stringify(await buildSeyeonSecurityS0InstallationPlan(), null, 2) + '\n');
}
