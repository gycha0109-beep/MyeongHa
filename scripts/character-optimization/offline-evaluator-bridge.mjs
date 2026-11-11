/** Offline metadata-only Node endpoint for Python GEPA experiments. No provider I/O. */
import { validateEvaluationEvidence, assessCandidateForOwnerReview } from './src/index.mjs';

async function readStdin() {
  let chunks='';
  for await (const piece of process.stdin) {
    chunks+=piece.toString('utf8');
    if (chunks.length > 65536) throw new Error('INPUT_TOO_LARGE');
  }
  return chunks;
}
try {
  const input=JSON.parse(await readStdin());
  if (!input || Array.isArray(input) || typeof input!=='object' ||
      JSON.stringify(Object.keys(input).sort()) !== JSON.stringify(['evidence','schemaVersion']) ||
      input.schemaVersion !== 'character-optimization-evidence-bridge-v1') throw new Error('UNRECOGNIZED_BRIDGE_INPUT');
  const evidence=validateEvaluationEvidence(input.evidence);
  const decision=assessCandidateForOwnerReview(input.evidence);
  process.stdout.write(JSON.stringify({
    schemaVersion:'character-optimization-evidence-bridge-result-v1',
    sourceCounts:evidence.sourceCounts,hardFailureCount:evidence.hardFailureCount,
    reviewState:decision.state,promotionAllowed:false,
    modelCalls:0,productionChanges:false,
  })+'\n');
} catch (error) {
  // Never print input/error stacks that could contain private model outputs.
  process.stderr.write('CHARACTER_OPTIMIZATION_BRIDGE_REJECTED\n');
  process.exitCode=1;
}
