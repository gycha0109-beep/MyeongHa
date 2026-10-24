/**
 * C08 §7.3 paid pilot: protected-main one-shot V2.
 * V1 (run 40014505187) attempted ZERO inference POSTs due to the optional
 * ZDR preview catalog returning data:null. V2 uses exact model endpoint GET
 * and enforces zdr=true / deny / strict schema on the actual, at-most-one POST.
 * This file is not a model deployment or a replay of the V1 run.
 */
import {executeSeyeonC08N06ResearchWorkflowV2,
  preflightSeyeonC08N06ModelEndpointV2}
  from './seyeon-c08-n06-actual-paid-canary-once-v1.mjs';
const workflow='seyeon-c08-n06-paid-exact-model-once-v2.yml';
const marker='.github/seyeon-c08-n06-paid-exact-model-once-v2.trigger';
executeSeyeonC08N06ResearchWorkflowV2({
  workflow,marker,routePreflight:preflightSeyeonC08N06ModelEndpointV2,
}).catch(()=>{
  console.error('C08_N06_EXACT_MODEL_PAID_ONCE_V2_HOLD');
  process.exitCode=1;
});
