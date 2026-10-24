/**
 * C08 synthetic N06 V4 first-turn actual research; owner authorized one more
 * bounded paid call after V3 POST yielded HTTP 200 but 256/256 completion
 * tokens and invalid JSON. New main one-shot marker, not a replay.
 * Main adapter has reasoning effort low; exact provider tag and cost/JSON
 * guards are preserved. Do not make production routing changes.
 */
import {
  executeSeyeonC08N06ResearchWorkflowV2,
  preflightSeyeonC08N06ModelEndpointV2,
} from './seyeon-c08-n06-actual-paid-canary-once-v1.mjs';

executeSeyeonC08N06ResearchWorkflowV2({
  workflow:'seyeon-c08-n06-paid-low-reasoning-once-v4.yml',
  marker:'.github/seyeon-c08-n06-paid-low-reasoning-once-v4.trigger',
  routePreflight:preflightSeyeonC08N06ModelEndpointV2,
}).catch(()=>{
  console.error('C08_N06_PAID_TOKEN_ONLY_V4_HOLD');
  process.exitCode=1;
});
