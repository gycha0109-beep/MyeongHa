// Watchtower-Track: security
// Source-only adapter. Never grants Provider, Commit, or Reveal authority.
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { SeyeonExactModelPersonalSourceSelectionV1 } from './seyeon-exact-model-personal-source-selection-v1.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const DIGEST = /^sha256:v1:[a-f0-9]{64}$/u;

export const SEYEON_G1_RECENT_SOURCE_PIN_V1 = Object.freeze({
  sql: 'seyeon_private.pin_model_recent_sources_v1',
  productionMounted: false,
  permitsProvider: false,
  permitsAtomicCommit: false,
  permitsHttpReveal: false,
} as const);

export async function pinSeyeonG1RecentSourcesCandidateV1(input: Readonly<{
  client: PostgresTransactionQueryV1;
  subjectId: string;
  threadId: string;
  turnId: string;
  attemptId: string;
  currentUserMessageId: string;
  selection: SeyeonExactModelPersonalSourceSelectionV1;
}>): Promise<Readonly<Record<string, unknown>>> {
  const fail = (): never => { throw new Error('G1 recent source immutable certificate unavailable'); };
  if (![input.subjectId, input.threadId, input.turnId, input.attemptId,
    input.currentUserMessageId].every(id => typeof id === 'string' && UUID.test(id))) fail();
  const selection = input.selection;
  if (!selection || selection.persistedBeforeModel !== false ||
    selection.permitsAtomicCommit !== false || selection.permitsHttpReveal !== false ||
    !DIGEST.test(selection.selectedModelSourceCensusDigest) ||
    selection.selectedCurrentUserSource?.messageId !== input.currentUserMessageId ||
    selection.selectedCurrentUserSource?.role !== 'user' ||
    !Array.isArray(selection.selectedUnpinnedRecentSources) ||
    !Array.isArray(selection.selectedUnpinnedDerivedSources) ||
    selection.selectedUnpinnedDerivedSources.length !== 0) fail();

  const current = selection.selectedCurrentUserSource;
  if (!current) fail();
  const selected = [...selection.selectedUnpinnedRecentSources, current];
  const expectedCensus = 'sha256:v1:' + createHash('sha256').update(canonicalJson({
    originalPersonalSources: selection.selectedSources,
    currentUserSource: current,
    unpinnedRecentSources: selection.selectedUnpinnedRecentSources,
    unpinnedDerivedSources: [],
  })).digest('hex');
  if (expectedCensus !== selection.selectedModelSourceCensusDigest) fail();
  if (selected.length < 1 || selected.length > 25) fail();
  const seen = new Set<string>();
  for (const source of selected) {
    if (!source || !UUID.test(source.messageId) ||
      !['user', 'assistant'].includes(source.role) ||
      !DIGEST.test(source.selectedModelMessageDigest) ||
      source.persistedBeforeModel !== false ||
      seen.has(source.messageId)) fail();
    seen.add(source.messageId);
  }
  // Caller must supply the model-selected order; this adapter does not
  // reconstruct that order from the two census categories. Only the current
  // User may be last in the G0 chronological model window.
  const rows = await input.client.query<{certificate:unknown}>(`
select seyeon_private.pin_model_recent_sources_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::jsonb,$7::text
) as certificate`.trim(), [
    input.subjectId,input.threadId,input.turnId,input.attemptId,
    input.currentUserMessageId,
    JSON.stringify(selected.map(s => ({
      messageId:s.messageId,role:s.role,
      selectedModelMessageDigest:s.selectedModelMessageDigest,
    }))),
    selection.selectedModelSourceCensusDigest,
  ]);
  if (rows.rows.length !== 1 || !rows.rows[0] ||
      !rows.rows[0].certificate || typeof rows.rows[0].certificate !== 'object') fail();
  const receipt = rows.rows[0].certificate as Record<string, unknown>;
  if (receipt.schemaVersion !== 'seyeon-g1-recent-model-source-pin-v1' ||
    receipt.subjectId !== input.subjectId ||
    receipt.threadId !== input.threadId ||
    receipt.turnId !== input.turnId ||
    receipt.attemptId !== input.attemptId ||
    receipt.selectedModelSourceCensusDigest !== selection.selectedModelSourceCensusDigest ||
    !Array.isArray(receipt.sources) || receipt.sources.length !== selected.length) fail();
  return Object.freeze(receipt);
}
