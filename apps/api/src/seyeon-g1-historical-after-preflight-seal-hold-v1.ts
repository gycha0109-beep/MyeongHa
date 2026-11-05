// Watchtower-Track: security
// S0 future positive G1 callback, kept OFF the production Provider path.
// Persists an immutable, non-authorizing receipt only after the real
// governed-Preflight Interpreter Context matches the original DB Candidate.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import type {SeyeonRuntimeContextV2} from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import type {RunSeyeonCharacterTurnV2Input} from './seyeon-character-runtime-v2.js';
import type {SeyeonPersonalRecordProjectionCandidateV1} from './seyeon-production-context-v1.js';
import type {SeyeonG1HistoricalFinalContextSealPortV1} from './postgres-seyeon-g1-historical-final-context-seal-port-v1.js';
import type {SeyeonG1HistoricalSourceAdmissionPortV1} from './postgres-seyeon-g1-historical-source-admission-port-v1.js';
import {
  assertSeyeonG1HistoricalPostPreflightContextCandidateV1,
  SeyeonG1HistoricalPostPreflightContextHoldV1,
} from './seyeon-g1-historical-final-context-proof-v1.js';
import type {buildSeyeonG1HistoricalModelWindowCensusV1} from './seyeon-g1-historical-model-window-census-v1.js';

type HistoricalCensus=ReturnType<typeof buildSeyeonG1HistoricalModelWindowCensusV1>;

export interface SeyeonG1HistoricalPostPreflightSealHoldInputV1 {
  readonly subjectId:string;
  readonly threadId:string;
  readonly turnId:string;
  readonly attemptId:string;
  readonly pinnedContextInput:RunSeyeonCharacterTurnV2Input['contextInput'];
  readonly currentUserMessageId:string;
  readonly currentUserText:string;
  readonly sourceCandidates:readonly SeyeonPersonalRecordProjectionCandidateV1[];
  readonly census:HistoricalCensus;
  readonly persistedHistoricalCandidateProof:Readonly<Record<string,unknown>>;
  readonly sealPort:SeyeonG1HistoricalFinalContextSealPortV1;
  /** S0-only DB Owner source-selection admission; NEVER Model dispatch. */
  readonly sourceAdmissionPort:SeyeonG1HistoricalSourceAdmissionPortV1;
}

/**
 * Supplies the real runtime's `assertBeforeModelContext` callback.
 *
 * 1) Check the assembled packet AFTER governed Preflight.
 * 2) Inside the DB Owner transaction, recheck ALL current originals and
 *    persist a separate immutable historical final-context receipt.
 * 3) Require DB Owner to issue immutable exact-source selection approval
 *    after the seal. A success still forbids Model dispatch/Commit/Reveal.
 * 4) ALWAYS HOLD, even if every check succeeds.
 *
 * A DB call or receipt failure also HOLDS. The callback MUST be awaited by
 * the runtime before Interpreter. Never run this in a swallowed catch that
 * later permits Provider execution.
 */
export function createSeyeonG1HistoricalPostPreflightSealHoldV1(
  input:SeyeonG1HistoricalPostPreflightSealHoldInputV1,
):NonNullable<RunSeyeonCharacterTurnV2Input['assertBeforeModelContext']> {
  return async (assembledContext:SeyeonRuntimeContextV2):Promise<never>=>{
    try {
      // Fail before any DB mutation when the actual Preflight output has
      // an unpinned or altered source.
      assertSeyeonG1HistoricalPostPreflightContextCandidateV1({
        pinnedContextInput:input.pinnedContextInput,
        currentUserMessageId:input.currentUserMessageId,
        currentUserText:input.currentUserText,
        sourceCandidates:input.sourceCandidates,
        census:input.census,
        persistedHistoricalCandidateProof:input.persistedHistoricalCandidateProof,
        assembledContext,
      });

      const actualFinalModelContextDigest='sha256:v1:'+
        createHash('sha256').update(canonicalJson(assembledContext)).digest('hex');
      const preModelContextDigest=input.persistedHistoricalCandidateProof.preModelContextDigest;
      if(typeof preModelContextDigest!=='string')
        throw new SeyeonG1HistoricalPostPreflightContextHoldV1();

      // Port validates the strict 13-field receipt; its Owner SQL locks
      // Subject, Turn, Attempt, ALL originals and approved Memory Grant.
      // Caller supplies an independently committed DB Owner port. A
      // successful receipt is NOT an admission and MUST NOT resume runtime.
      const sealed=await input.sealPort.sealAfterContextVerification({
        subjectId:input.subjectId,
        threadId:input.threadId,
        turnId:input.turnId,
        attemptId:input.attemptId,
        actualFinalModelContextDigest,
        preModelContextDigest,
        historicalSourceCount:input.census.historicalSourceCount,
      });
      const originalRecordId=input.persistedHistoricalCandidateProof.recordId;
      const originalGrantId=input.persistedHistoricalCandidateProof.originalGrantId;
      const historicalSourceCensusDigest=
        input.persistedHistoricalCandidateProof.historicalSourceCensusDigest;
      if(typeof originalRecordId!=='string'
        ||typeof originalGrantId!=='string'
        ||typeof historicalSourceCensusDigest!=='string')
        throw new SeyeonG1HistoricalPostPreflightContextHoldV1();

      // Recheck the original records and exact consent once more under
      // the Owner admission TX; the source selection receipt is independent
      // from (and cannot upgrade) historical Model/G2/G3 authority.
      await input.sourceAdmissionPort.admitExactSources({
        subjectId:input.subjectId,
        threadId:input.threadId,
        turnId:input.turnId,
        attemptId:input.attemptId,
        finalModelContextDigest:sealed.finalModelContextDigest,
        candidatePgJsonbDigest:sealed.candidatePgJsonbDigest,
        originalRecordId,
        originalGrantId,
        historicalSourceCount:input.census.historicalSourceCount,
        historicalSourceCensusDigest,
      });
    } catch {
      // Any interrupted or already-committed S0 seal stays non-retryable.
      throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
    }
    // A successful sealed candidate cannot reach Interpreter, Commit, Reveal.
    throw new SeyeonG1HistoricalPostPreflightContextHoldV1();
  };
}
