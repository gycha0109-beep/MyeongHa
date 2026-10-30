import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sql=readFileSync(new URL('../../admin/database/reading-ai-call-cost-offline-v1.sql',import.meta.url),'utf8');

describe('Reading AI cost offline PostgreSQL candidate',()=>{
  it('uses valid matching PL/pgSQL function delimiters before any Production DDL',()=>{
    expect(sql).not.toMatch(/\bas\s+\$(?!\$)/u);
    expect(sql).not.toMatch(/\bend\s+\$\s*;/u);
    expect(sql.match(/\bas\s+\$\$/gu)).toHaveLength(3);
    expect(sql.match(/\bend\s+\$\$\s*;/gu)).toHaveLength(4);
    for(const functionName of [
      'cmd_record_reading_ai_call_v1',
      'qry_reading_ai_cost_calls_v1',
      'qry_reading_ai_cost_month_v1',
    ])expect(sql).toContain(functionName);
    expect(sql).toContain('grant execute on function myeongha_admin_ops.qry_reading_ai_cost_month_v1');
    expect(sql).toContain('to myeongha_admin_reader;');
    // call_id is also a RETURNS TABLE output variable. Naming the actual
    // unique constraint avoids PL/pgSQL's ambiguous variable/column arbiter.
    expect(sql).not.toMatch(/on conflict\s*\(call_id\)/u);
    expect(sql).toContain('on conflict on constraint reading_ai_call_cost_events_v1_pkey do nothing');
  });
});
