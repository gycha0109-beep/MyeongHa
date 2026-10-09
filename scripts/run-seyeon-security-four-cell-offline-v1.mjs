#!/usr/bin/env node
// Offline only: deliberately has no import path to the OpenAI provider or network.
import { readFileSync } from 'node:fs';
import {
  buildSeyeonSecurityFourCellOfflinePlanV1,
  SEYEON_SECURITY_EVAL_PILOT_CASE_CAP_V1,
} from './seyeon-security-four-cell-eval-plan-v1.mjs';
import { SEYEON_DIALOGUE_PATH_CASE_IDS_V1 } from './seyeon-dialogue-path-eval-core-v1.mjs';

function requirePinnedText(path, regex) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const matched = source.match(regex);
  if (!matched?.[1]) throw new Error('Failed to pin the current security boundary source.');
  return matched[1];
}
const v1 = requirePinnedText('../apps/api/src/openai-seyeon-structured-provider-v1.ts',
  /const SEYEON_PROVIDER_UNTRUSTED_DATA_BOUNDARY_V1 =\s*'([^']+)';/u);
const v2 = requirePinnedText('../apps/api/src/seyeon-security-boundary-shadow-v2.ts',
  /const SEYEON_SECURITY_BOUNDARY_SHADOW_TEXT_V2 =\s*'([^']+)' as const;/u);
const result = buildSeyeonSecurityFourCellOfflinePlanV1({
  caseIds: SEYEON_DIALOGUE_PATH_CASE_IDS_V1.slice(0, SEYEON_SECURITY_EVAL_PILOT_CASE_CAP_V1),
  v1Characters: v1.length,
  v2Characters: v2.length,
});
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
// No LIVE flag, API key, fetch, prompt substitution, response content or paid dispatch.
