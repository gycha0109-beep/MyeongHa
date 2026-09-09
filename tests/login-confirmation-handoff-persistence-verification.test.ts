import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'apps', 'web', 'auth-page.js'), 'utf8');

describe('confirmation handoff persistence verification', () => {
  it('verifies each authoritative journal entry by exact read-back', () => {
    expect(source).toMatch(/function writeConfirmationGuestHandoffJournalEntry\(entry\)[\s\S]*const key = `\$\{CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX\}\$\{suffix\}`;[\s\S]*const raw = JSON\.stringify\(entry\);[\s\S]*localStorage\.setItem\(key, raw\);[\s\S]*localStorage\.getItem\(key\) === raw/);
  });

  it('verifies the journal marker before switching authority from the legacy aggregate', () => {
    expect(source).toMatch(/ensureConfirmationGuestHandoffJournalInitialized\(\)[\s\S]*for \(const entry of legacyEntries\)[\s\S]*if \(!writeConfirmationGuestHandoffJournalEntry\(entry\)\) return false;[\s\S]*localStorage\.setItem\(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY, '1'\);[\s\S]*localStorage\.getItem\(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY\) === '1'/);
  });

  it('does not stage the current signup handoff after an unverified legacy migration', () => {
    expect(source).toMatch(/locks\.request\(CONFIRMATION_GUEST_HANDOFF_LOCK_NAME, \{ mode: 'exclusive' \}, \(\) => \{[\s\S]*if \(!ensureConfirmationGuestHandoffJournalInitialized\(\)\) return false;[\s\S]*writeConfirmationGuestHandoffJournalEntry\(entry\)/);
  });

  it('does not invent canonical Subject identity while migrating browser handoffs', () => {
    expect(source).not.toContain('subjectId');
    expect(source).not.toContain('authUserId');
  });
});
