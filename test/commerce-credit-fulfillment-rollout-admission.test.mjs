// Watchtower-Track: commerce-payment
import {describe,it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/operations/commerce/rollout-verified-credit-receipt-fulfillment-v1.mjs',import.meta.url));
describe('Production fulfillment rollout admission',()=>{
 it.each([{}, {GITHUB_REF:'refs/heads/feature'},
  {GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40),COMMERCE_ROLLOUT_HEAD_SHA:'b'.repeat(40)}])
 ('rejects missing or misattributed rollout authority before any connection %j',env=>{
  const r=spawnSync(process.execPath,[script],{encoding:'utf8',env:{PATH:process.env.PATH,...env}});
  expect(r.status).toBe(1);expect(r.stderr).toContain('"stage":"admission"');
 });
});
