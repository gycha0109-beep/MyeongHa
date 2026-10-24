/**
 * C08 N06 approved actual inference research. V2 main run #40079361920
 * performed ZERO paid POSTs because endpoint pricing has no "request" key.
 * Accept standard token-only provider price shape, preserve all other guards.
 * Distinct protected main-first-added marker; V1/V2 never re-run.
 */
import {
  executeSeyeonC08N06ResearchWorkflowV2,
  preflightSeyeonC08N06ModelEndpointV2,
} from './seyeon-c08-n06-actual-paid-canary-once-v1.mjs';

executeSeyeonC08N06ResearchWorkflowV2({
  workflow:'seyeon-c08-n06-paid-token-only-once-v3.yml',
  marker:'.github/seyeon-c08-n06-paid-token-only-once-v3.trigger',
  routePreflight:preflightSeyeonC08N06ModelEndpointV2,
}).catch(()=>{
  console.error('C08_N06_PAID_TOKEN_ONLY_V3_HOLD');
  process.exitCode=1;
});
