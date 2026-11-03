import {describe,expect,it} from 'vitest';
import {fetchAdminAnalyticsDashboardV1} from './AdminAnalyticsDashboard.js';
import {AdminAccessDeniedErrorV1} from './admin-client.js';

describe('analytics dashboard browser boundary',()=>{
  const token='header.claims.signature';
  it('requires an Owner response and validates the dashboard contract',async()=>{
    await expect(fetchAdminAnalyticsDashboardV1(token,new URLSearchParams(),(async()=>Response.json({},{status:403}))as typeof fetch)).rejects.toBeInstanceOf(AdminAccessDeniedErrorV1);
    await expect(fetchAdminAnalyticsDashboardV1(token,new URLSearchParams(),(async()=>Response.json({rows:[]}))as typeof fetch)).rejects.toThrow('계약');
    await expect(fetchAdminAnalyticsDashboardV1(token,new URLSearchParams({secret:'x'}))).rejects.toThrow('허용');
  });
});
