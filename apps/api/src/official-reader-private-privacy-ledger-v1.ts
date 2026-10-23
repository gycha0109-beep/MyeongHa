/**
 * S4/S6 interface for the Privacy Owner's OUTSIDE-primary-backup delete
 * tombstone + restore-epoch authority. A local PostgreSQL table, a Date.now()
 * check, and ordinary Commerce payment status cannot implement this port.
 *
 * No provider is installed while Privacy #2318 remains unaccepted; readers
 * fail closed when this port is missing. Keys and source text do not cross it.
 */
export interface OfficialReaderPrivacyReadLeaseV1 {
  readonly contractVersion: 'official-reader-privacy-read-lease-v1';
  readonly subjectId: string;
  readonly selector: string;
  /** Opaque off-primary ledger checkpoint; never client supplied. */
  readonly ledgerCheckpoint: string;
  readonly restoreEpoch: string;
  readonly expiresAtEpochMs: number;
}

export interface OfficialReaderPrivatePrivacyLedgerPortV1 {
  /**
   * Must consult the independent deletion ledger and restore fence:
   * - all account/answer tombstones since backup replayed
   * - subject not deletion_pending/deleted
   * - no revoked/shredded protected key reactivated
   * - latest proven restore epoch (not just the local DB's timestamp)
   * Return null on outage, staleness, ambiguity or unmatched selector.
   */
  acquireReadLease(input: Readonly<{
    subjectId: string;
    selector: string;
  }>): Promise<OfficialReaderPrivacyReadLeaseV1 | null>;

  /**
   * Synchronous, no network/DB I/O while the Reader's S1 advisory lock is
   * held. Only the Owner's trusted local checkpoint cache may affirm this.
   * A removed/revoked/tombstoned identifier MUST invalidate its lease.
   */
  isLeaseCurrent(input: Readonly<{
    lease: OfficialReaderPrivacyReadLeaseV1;
    subjectId: string;
    selector: string;
    currentEpochMs: number;
  }>): boolean;
}

export function currentOfficialReaderPrivacyReadLeaseV1(input: {
  readonly port: OfficialReaderPrivatePrivacyLedgerPortV1;
  readonly lease: OfficialReaderPrivacyReadLeaseV1 | null;
  readonly subjectId: string;
  readonly selector: string;
}): boolean {
  const { port, lease, subjectId, selector } = input;
  if (!port || typeof port.isLeaseCurrent !== 'function' || !lease) return false;
  if (lease.contractVersion !== 'official-reader-privacy-read-lease-v1'
      || lease.subjectId !== subjectId || lease.selector !== selector
      || typeof lease.ledgerCheckpoint !== 'string'
      || lease.ledgerCheckpoint.trim().length === 0
      || typeof lease.restoreEpoch !== 'string'
      || lease.restoreEpoch.trim().length === 0
      || !Number.isFinite(lease.expiresAtEpochMs)
      || lease.expiresAtEpochMs <= Date.now()
      || lease.expiresAtEpochMs - Date.now() > 30_000) {
    return false;
  }
  try {
    return port.isLeaseCurrent({
      lease, subjectId, selector, currentEpochMs: Date.now(),
    }) === true;
  } catch {
    return false;
  }
}
