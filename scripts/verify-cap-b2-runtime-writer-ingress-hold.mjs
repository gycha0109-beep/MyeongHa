#!/usr/bin/env node
// CAP-B2/R3: fail-closed ingress HOLD inventory; not an authorization or
// a complete runtime call graph. Watchtower-Track: applizing.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

function must(value, why) { if (!value) throw Error('B2-R3 ingress HOLD: ' + why); }
const knownLegacy = [
  ['apps/api/src/postgres-standard-reading-access-bind-v2.ts',
    'from public.cmd_bind_standard_reading_access_v2('],
  ['apps/api/src/postgres-standard-reading-purchase-intent-v4.ts',
    'from public.cmd_create_standard_reading_purchase_intent_v4('],
  ['apps/api/src/commerce-verified-payment-evidence-persistence.ts',
    'from public.cmd_persist_verified_payment_evidence_v1('],
  ['apps/api/src/official-reader-held-t1-t2-preflight-v1.ts',
    'R2_SCOPE_AND_FINAL_DISCLOSURE_OWNER_HOLD'],
];
for (const [path, marker] of knownLegacy) {
  must((await readFile(path, 'utf8')).includes(marker), 'known legacy/held path changed: ' + path);
}
// These private functions are not authorized runtime ingress. Detect direct
// SQL calls or explicit public-function binding in source, NOT comments alone.
const privateNames = [
  'internal_capture_b2_r1_initial_checkout_scope_pin_v1',
  'internal_execute_b2_r2_initial_verified_cancel_effect_private_v1',
  'internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1',
  'internal_cmd_bind_standard_reader_initial_policy_locked_v1',
  'internal_apply_initial_official_reader_receipt_locked_v1',
  'internal_cmd_bind_standard_reader_additional_policy_locked_v1',
  'internal_apply_official_reader_provider_revoke_locked_v1',
];
let inspected = 0;
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules','dist','coverage','.next','test','tests','__tests__']
      .includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await inspect(path); continue; }
    if (!/\.(?:ts|tsx|mts|js|mjs)$/.test(entry.name) ||
        /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    inspected++;
    const src = await readFile(path, 'utf8');
    for (const name of privateNames) {
      const call = new RegExp('(?:public\\.)?' + name + '\\s*\\(');
      const binding = new RegExp('public\\.' + name + '[\\x27\\x22\\x60]');
      must(!call.test(src) && !binding.test(src),
        'unapproved private SQL Writer referenced from ' + path + ': ' + name);
    }
  }
}
for (const root of ['api','apps/api/src','packages']) await inspect(root);
must(inspected > 50, 'runtime inventory unexpectedly empty');
console.log('PASS B2-R3 runtime ingress HOLD inventory ' + JSON.stringify({
  legacyCallerPaths: knownLegacy.length, runtimeFiles: inspected,
  privateEntrypointsProhibited: privateNames.length,
  operationalCutover: false, paidDisclosure: false, privacyApproval: false
}));
