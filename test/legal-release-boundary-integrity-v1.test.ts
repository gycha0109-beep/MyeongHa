import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1,
} from '../apps/api/src/production-purchase-intent-create-runtime-v3.js';
import {
  LEGAL_READER_S7_OWNER_BRIDGE_V1,
} from '../apps/api/src/commerce-reader-s7-owner-withdrawal-bridge-v1.js';
import {
  OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1,
} from '../apps/api/src/commerce-digital-reading-withdrawal-orchestration-v1.js';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const proposed=Array.from({length:4},(_,index)=>[
  '1740_portone_identity_age_authority_v1',
  '1741_portone_preenrollment_age_authority_v1',
  '1742_existing_member_social_state_v1',
  '1743_digital_reading_checkout_delivery_evidence_v1',
][index]!);

describe('LEGAL L1–L5 release boundary and prohibited shortcuts',()=>{
  it.each(proposed)('holds unapplied %s SQL as a proposal, never a migration',(name)=>{
    expect(existsSync(new URL('../supabase/proposals/'+name+'.proposed.sql',import.meta.url)))
      .toBe(true);
    expect(existsSync(new URL('../supabase/migrations/'+name+'.sql',import.meta.url)))
      .toBe(false);
  });

  it('keeps all four independent sale release gates false, irrespective of verified age',()=>{
    expect(Object.keys(LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1)).toHaveLength(4);
    expect(Object.values(LEGAL_DIGITAL_READING_PURCHASE_HOLD_V1)).toEqual([
      false,false,false,false,
    ]);
  });

  it('keeps paid Reader legal and S7 review internal and without mutation authority',()=>{
    expect(OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1.publicRoute).toBeNull();
    expect(OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1.providerRefundAuthorized).toBe(false);
    expect(OWNED_DIGITAL_READING_WITHDRAWAL_REVIEW_V1.entitlementMutationAuthorized).toBe(false);
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.publicRoute).toBeNull();
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.ownerRuntimeSqlGranted).toBe(false);
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.actualConsumerDeliveryProven).toBe(false);
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.mayAutomaticallyDeny).toBe(false);
    expect(LEGAL_READER_S7_OWNER_BRIDGE_V1.mayRefundProvider).toBe(false);
  });

  it('never transforms a Server S7 prepare or client ACK into actual legal delivery',()=>{
    const journal=source('apps/api/src/commerce-reader-s7-owner-withdrawal-bridge-v1.ts');
    const writer=source('apps/api/src/postgres-digital-reading-withdrawal-evidence-v1.ts');
    const review=source('apps/api/src/commerce-reader-s7-owner-withdrawal-bridge-v1.ts');
    expect(writer).toContain('content_delivered');
    expect(review).toContain('legallyProvenDeliveredAt: null');
    expect(review).toContain('actualConsumerDeliveryProven: false');
    expect(journal).not.toContain('cmd_record_digital_reading_delivery_v1(');
    expect(journal).not.toContain('recordInternalDigitalReadingEvidenceV1(');
  });

  it('enforces original purchase Subject and owner-only S7 integration',()=>{
    const sql=source('supabase/proposals/1743_digital_reading_checkout_delivery_evidence_v1.proposed.sql');
    for(const name of [
      'qry_legal_digital_reading_checkout_ready_v1',
      'qry_legal_digital_reading_handoff_ready_v1',
      'cmd_record_digital_reading_checkout_ack_v1',
      'cmd_record_digital_reading_delivery_v1',
      'qry_owned_digital_reading_withdrawal_snapshot_v1',
    ]) expect(sql).toContain(name);
    expect(sql).toContain('for update of pi');
    expect(sql).toContain('public.assert_myeongha_subject_context_v1');
    expect(sql).toContain('receipt.verification_status=\'verified\'');
    expect(sql).toContain('receipt.environment=\'production\'');
  });

  it('preserves the approved Privacy delete graph and retention constants in validation authority',()=>{
    const plan=source('docs/LEGAL_COMPLIANCE_VALIDATION_PLAN_V1.md');
    expect(plan).toContain('59 = 46 DELETE / 4 ANONYMIZE / 9 RETAIN');
    expect(plan).toContain('c745bacb0e9b2d13013c1048fc4273203af68b9c4816eef7b6c9fe37e4db167b');
    expect(plan).toContain('P5Y/P30D');
  });

  it('prevents the targeted DB tests from using a Production host or credentials',()=>{
    for(const file of [
      'test/db/legal_commerce_checkout_delivery_pg17.sh',
      'test/db/portone_identity_age_authority_pg17.sh',
    ]){
      const script=source(file);
      expect(script).toContain('GITHUB_ACTIONS');
      expect(script).toContain('DB_SUITE');
      expect(script).toContain('localhost');
      expect(script).toContain('myeongha_ci_case_');
    }
  });
});
