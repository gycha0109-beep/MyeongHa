import { describe, expect, it } from 'vitest';
import { buildListPath } from './AdminWorkbench.js';

describe('administrator investigation navigation', () => {
  it('does not carry unsupported date filters from investigations into catalog metadata', () => {
    for (const tab of ['catalog', 'characters', 'content-releases'] as const) {
      const url = new URL(buildListPath('issues', '', null, tab, '2026-10-01', '2026-10-27'), 'https://admin.invalid');
      expect(url.searchParams.has('from')).toBe(false);
      expect(url.searchParams.has('to')).toBe(false);
    }
  });
  it('carries user and exact receipt filters into paginated entitlement history', () => {
    const subject = '123e4567-e89b-42d3-a456-426614174002';
    const receipt = '123e4567-e89b-42d3-a456-426614174003';
    const path = buildListPath('commerce', subject, '20', 'entitlement-events', null, null,
      'all', 'all', 'all', 'all', '', 'all', 'all', '', '', 'all', '', 'all', 'all', 'all', 'all', 'all', 'all', false, receipt);
    const url = new URL(path, 'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/entitlement-events');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '20', cursor: '20', subjectId: subject, receiptId: receipt });
  });
  it('routes Reading generation cost separately from Character AI consuming its grounding',()=>{
    const reading='123e4567-e89b-42d3-a456-426614174001';
    const path=buildListPath('readings','', '20','reading-generation-cost',null,null,
      'all','all','all','all','','all','all','',reading);
    const url=new URL(path,'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/readings/'+reading+'/generation-cost');
    expect(Object.fromEntries(url.searchParams)).toEqual({limit:'20',cursor:'20'});
    const linked=buildListPath('readings','',null,'reading-ai-usage',null,null,
      'all','all','all','all','','all','all','',reading);
    expect(new URL(linked,'https://admin.invalid').pathname)
      .toBe('/api/admin/readings/'+reading+'/ai-usage');
  });

});
