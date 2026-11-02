import {describe,expect,it} from 'vitest';
import {adminLocalDatetimeToUtcV1,adminUtcToLocalDatetimeV1} from './admin-local-datetime-v1.js';

describe('Admin datetime-local conversion',()=>{
  it('converts the operator browser local time to the UTC wire instant, not a UTC-labelled wall time',()=>{
    const local='2026-10-27T19:30';
    expect(adminLocalDatetimeToUtcV1(local)).toBe(new Date(2026,9,27,19,30).toISOString());
    expect(adminUtcToLocalDatetimeV1(adminLocalDatetimeToUtcV1(local))).toBe(local);
  });
  it('round-trips a stored UTC publication schedule as editable browser local wall time',()=>{
    const utc='2026-10-27T10:30:00.000Z';
    expect(adminLocalDatetimeToUtcV1(adminUtcToLocalDatetimeV1(utc))).toBe(utc);
  });
  it('rejects invalid dates, non-existent local time and unbounded inputs',()=>{
    for(const value of ['2026-02-30T12:00','2026-10-27T25:00','2026-10-27T12:00Z','2026-10-27','not-a-date'])
      expect(()=>adminLocalDatetimeToUtcV1(value)).toThrow();
  });
});
