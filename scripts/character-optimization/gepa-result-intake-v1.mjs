/** Intake of *untrusted* Python GEPA research output into a never-approved draft.
 * No provider I/O, human approval, production mutation or raw evaluation logs.
 */
import { CHARACTER_IDS, digest, validateCandidate } from './contracts-v1.mjs';

const fail = reason => { throw new Error('CHARACTER_GEPA_RESULT_INTAKE_INVALID:' + reason); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const exact = (value, keys) => plain(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');

const PACKET_KEYS = Object.freeze([
  'schemaVersion', 'optimizer', 'runManifestSha256', 'sourceSeedSha256',
  'proposal', 'researchEvidence', 'externalCallsAuthorized', 'externalCalls',
  'productionEligible',
]);
const PROPOSAL_KEYS = Object.freeze([
  'schemaVersion', 'slot', 'text', 'textSha256', 'pinnedContextSha256',
  'status', 'semanticSafetyVerified', 'productionEligible',
]);
const EVIDENCE_KEYS = Object.freeze([
  'bestScoreSyntheticOnly', 'totalEvals', 'sourceAuthenticated',
  'independentQualityGainEstablished', 'ownerReviewGranted', 'heldoutPassed',
  'releaseApproved',
]);

/** Validate the *shape and scope*, not the independently unverifiable origin.
 * A correctly formatted Python packet is not approval or a trusted score.
 */
export function intakeFrozenGepaResult({ manifest, packet }) {
  if (!plain(manifest) || manifest.schemaVersion !== 'character-optimization-run-v1'
      || !sha(manifest.manifestSha256)
      || manifest.externalCallsAuthorized !== false
      || manifest.ownerReviewVerified !== false
      || manifest.productionEligible !== false
      || manifest.qualityGainEstablished !== false) fail('untrusted_manifest');
  const { manifestSha256, ...body } = manifest;
  if (digest(body) !== manifestSha256) fail('modified_manifest');

  const target = manifest.target;
  const slot = target?.track === 'character' ? 'character_expression'
    : target?.track === 'shared' ? 'shared_expression' : null;
  const ids = target?.track === 'character' ? [target.characterId]
    : target?.track === 'shared' ? target.cohort?.map(x => x.characterId) : null;
  if (!slot || !Array.isArray(ids) || !ids.length
      || (target.track === 'shared' && ids.length < 2)
      || ids.some(id => !CHARACTER_IDS.includes(id))
      || new Set(ids).size !== ids.length) fail('manifest_scope');

  if (!exact(packet, PACKET_KEYS)
      || packet.schemaVersion !== 'character-gepa-frozen-result-v1'
      || packet.optimizer !== 'gepa'
      || packet.runManifestSha256 !== manifestSha256
      || !sha(packet.sourceSeedSha256)
      || packet.externalCallsAuthorized !== false
      || packet.externalCalls !== 0
      || packet.productionEligible !== false) fail('untrusted_result_packet');

  const p = packet.proposal, e = packet.researchEvidence;
  if (!exact(p, PROPOSAL_KEYS)
      || p.schemaVersion !== 'character-expression-proposal-v1'
      || p.slot !== slot || p.pinnedContextSha256 !== manifest.immutableSourcesSha256
      || p.status !== 'pending_owner_review'
      || p.semanticSafetyVerified !== false
      || p.productionEligible !== false) fail('untrusted_proposal');
  const verifiedCandidate = validateCandidate({ [slot]: p.text }, {
    slot, pinnedContextSha256: manifest.immutableSourcesSha256,
  });
  if (p.textSha256 !== verifiedCandidate.textSha256) fail('modified_expression');
  if (!exact(e, EVIDENCE_KEYS)
      || typeof e.bestScoreSyntheticOnly !== 'number'
      || !Number.isFinite(e.bestScoreSyntheticOnly)
      || e.bestScoreSyntheticOnly < 0 || e.bestScoreSyntheticOnly > 1
      || !Number.isInteger(e.totalEvals) || e.totalEvals < 1 || e.totalEvals > 10
      || e.sourceAuthenticated !== false
      || e.independentQualityGainEstablished !== false
      || e.ownerReviewGranted !== false
      || e.heldoutPassed !== false
      || e.releaseApproved !== false) fail('untrusted_optimizer_evidence');

  return Object.freeze({
    schemaVersion: 'character-gepa-result-intake-v1',
    manifestSha256,
    characterIds: Object.freeze([...ids]),
    candidate: verifiedCandidate,
    optimizerMetrics: Object.freeze({
      bestScoreSyntheticOnly: e.bestScoreSyntheticOnly,
      totalEvals: e.totalEvals,
    }),
    candidateRegistryStage: 'proposed',
    evaluationSourceAuthenticated: false,
    ownerReviewGranted: false,
    heldoutPassed: false,
    releaseApproved: false,
    independentQualityGainEstablished: false,
    productionEligible: false,
    externalCallsAuthorized: false,
    externalCalls: 0,
    decision: 'hold_for_independent_evidence_and_human_review',
  });
}
