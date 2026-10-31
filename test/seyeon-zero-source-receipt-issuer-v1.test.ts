import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {assertSeyeonZeroSourceHttpReceiptReadyV1,SEYEON_ZERO_FIRST_RECEIPT_ISSUER_V1} from '../apps/api/src/seyeon-zero-source-http-receipt-ready-v1.js';
import {SEYEON_SECURITY_S0_PRODUCTION_V1} from '../apps/api/src/seyeon-security-s0-production-policy-v1.js';

const read=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

describe('Cloudflare zero-personal-source first reply is server-owned and fail-closed',()=>{
  it('admits no uninstalled or unowned DB issuer before paid dispatch',async()=>{
    const query=vi.fn(async(sql:string,args:unknown[])=>{
      expect(sql).toContain('count(*)=3');
      expect(sql).toContain("'row_security=off'=any(p.proconfig)");
      expect(sql).toContain("pg_get_userbyid(p.proowner)='postgres'");
      expect(sql).toContain("not has_function_privilege('anon',p.oid,'EXECUTE')");
      expect(sql).toContain("not has_function_privilege('authenticated',p.oid,'EXECUTE')");
      expect(sql).toContain("not has_function_privilege('service_role',p.oid,'EXECUTE')");
      expect(args).toEqual([
        'public.cmd_issue_seyeon_zero_source_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)',
        'public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)',
        'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)',
      ]);
      return {rows:[{ready:true}]};
    });
    await expect(assertSeyeonZeroSourceHttpReceiptReadyV1({query} as never)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
    await expect(assertSeyeonZeroSourceHttpReceiptReadyV1({query:async()=>({rows:[{ready:false}]})} as never))
      .rejects.toThrow('authority is not ready');
  });
  it('keeps production activation sealed until exact DB owner policy and tests',()=>{
    expect(SEYEON_SECURITY_S0_PRODUCTION_V1.zeroSourceFirstReplyApproved).toBe(true);
    const worker=read('cloudflare/myeongha-worker.mjs');
    const runtime=read('apps/api/src/production-seyeon-first-memory-node-runtime-v1.ts');
    const fetcher=read('apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts');
    expect(worker).toContain('SEYEON_SECURITY_S0_PRODUCTION_V1.zeroSourceFirstReplyApproved');
    expect(runtime).toContain('requiredPersonalRecordCount:input.zeroSourceFirstReplyApproved===true?0:1');
    expect(fetcher).toContain('if(zeroSource)');
    expect(fetcher).toContain(SEYEON_ZERO_FIRST_RECEIPT_ISSUER_V1);
    expect(fetcher).toContain('assertSeyeonG0OriginalLineageReadyV1');
    expect(fetcher).toContain('deliveryReceipt:{attemptId:e.committedTurn.attemptId,challenge}');
  });
  it('locks the original committed first turn and binds issuance to exact G2 receipt',()=>{
    const sql=read('scripts/operations/seyeon-security-s0/16-zero-source-http-receipt-issuer.sql');
    expect(sql).toContain('public.qry_seyeon_locked_first_zero_source_reveal_v1(');
    expect(sql).toContain('p_expected_client_turn_id');
    expect(sql).toContain('p_expected_user_message_id');
    expect(sql).toContain('p_expected_assistant_message_id');
    expect(sql).toContain('p_expected_post_turn_outbox_event_id');
    expect(sql).toContain("t.state='committed'");
    expect(sql).toContain("a.state='committed'");
    expect(sql).toContain('a.seyeon_positive_delivery_issued_at is null');
    expect(sql).toContain('a.seyeon_positive_delivery_received_at is null');
    expect(sql).toContain("'seyeon-positive-http-receipt-v1'");
    expect(sql).toContain('grant execute on function public.cmd_issue_seyeon_zero_source_first_reply_v1');
    expect(sql).toContain('to myeongha_api_executor;');
    expect(sql).not.toMatch(/\bdisable\s+trigger\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\.record_access_grants\b/i);
    expect(sql.trimEnd()).toMatch(/commit;$/);
  });
});
