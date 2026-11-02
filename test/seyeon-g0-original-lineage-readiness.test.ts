import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {
  assertSeyeonG0OriginalLineageReadyV1,
} from '../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js';

describe('Se-yeon G0 original-lineage readiness before durable Receive',()=>{
  it('requires four DB-owned functions with correct protected access',async()=>{
    const query=vi.fn(async (sql:string,args:unknown[])=>{
      expect(sql).toContain('count(*)=4 as ready');
      expect(sql).toContain("pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'");
      expect(sql).toContain("not has_function_privilege('anon',p.oid,'EXECUTE')");
      expect(sql).toContain("not has_function_privilege('authenticated',p.oid,'EXECUTE')");
      expect(sql).toContain("not has_function_privilege('service_role',p.oid,'EXECUTE')");
      expect(args).toEqual([
        'public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)',
        'public.qry_seyeon_g0_current_source_relationship_history_v1(uuid,text,bigint)',
        'seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)',
        'seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)',
      ]);
      return {rows:[{ready:true}]};
    });
    await expect(assertSeyeonG0OriginalLineageReadyV1({query})).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });
  it.each([false,null,undefined])('fails closed on missing or incorrect access: %s',async ready=>{
    const query=vi.fn(async()=>({rows:[{ready}]}));
    const logged=vi.spyOn(console,'error').mockImplementation(()=>undefined);
    try{
      await expect(assertSeyeonG0OriginalLineageReadyV1({query})).rejects.toThrow('Original-lineage context authority');
      expect(logged).toHaveBeenCalledWith('MYEONGHA_SEYEON_G0_READINESS_HOLD');
    } finally {logged.mockRestore();}
  });
  it('performs the G0 check after verification but before the chat runtime',()=>{
    const source=readFileSync(new URL('../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts',import.meta.url),'utf8');
    const start=source.indexOf('export async function handleSeyeonFirstPositiveMemoryFetchV1(');
    const body=source.slice(start);
    expect(body.indexOf('await assertSeyeonG0OriginalLineageReadyV1(client)'))
      .toBeGreaterThan(body.indexOf('preflightSeyeonChatTurnSendRequestV1(input)'));
    expect(body.indexOf('await assertSeyeonG0OriginalLineageReadyV1(client)'))
      .toBeLessThan(body.indexOf('input.runtime.run('));
  });
});
