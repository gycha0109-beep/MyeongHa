import { describe,expect,it } from 'vitest';
import {
  PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1,
  validatePrivateCancelExecutionLoginPreflightV1,
} from '../apps/api/src/official-reader-portone-cancel-private-execution-login-preflight-v1.js';

const ROLE='myeongha_cancel_d3e9_login_ci';
const columns=[...PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1.matchAll(
  /as "([^"]+)"/gu,
)].map(match=>match[1]!);
function zeroAuthority():Record<string,unknown> {
  const result=Object.fromEntries(columns.map(key=>[key,false]));
  return {
    ...result,
    sessionLogin:ROLE,
    effectiveRole:ROLE,
    canLogin:true,
    membershipCount:'0',
  };
}

describe('D3e9 detached cancellation operator-login ACL preflight',()=>{
  it('requires exact PostgreSQL query shape including inherited role hazards',()=>{
    expect(new Set(columns).size).toBe(columns.length);
    expect(columns).toContain('canDirectReview');
    expect(columns).toContain('canSignedReview');
    expect(columns).toContain('canReadInbox');
    expect(columns).toContain('canReadApproval');
    expect(columns).toContain('canClaimWork');
    expect(columns).toContain('canEnqueueAlerts');
    expect(columns).toContain('canBypassRls');
    expect(columns).toContain('membershipCount');
    expect(columns).toContain('canCreatePublic');
    expect(PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1).toContain(
      'where r.rolname=session_user',
    );
    expect(PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1).toContain(
      'pg_catalog.has_function_privilege(current_user',
    );
    expect(PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1).not.toMatch(
      /\b(?:refund|payout|entitlement_events)\b/iu,
    );
  });
  it('passes a login with zero authority without granting any operation',()=>{
    const pass=validatePrivateCancelExecutionLoginPreflightV1(zeroAuthority(),ROLE);
    expect(pass).toEqual({
      kind:'deny_all_login_preflight_pass',
      effectAuthorized:false,directReviewAuthorized:false,
      signedReviewAuthorized:false,providerRefundAuthorized:false,
      entitlementMutationAuthorized:false,
    });
    expect(Object.isFrozen(pass)).toBe(true);
  });
  it('fails CLOSED when D3e6, D3e8, work lifecycle or table authority is granted',()=>{
    const baseline=zeroAuthority();
    for (const name of columns.filter(x=>x.startsWith('can') && x!=='canLogin')){
      expect(()=>validatePrivateCancelExecutionLoginPreflightV1(
        {...baseline,[name]:true},ROLE,
      ),name).toThrow('DENIED');
    }
  });
  it('rejects extra membership, role impersonation, wrong shape or boolean coercion',()=>{
    const baseline=zeroAuthority();
    const bad:unknown[]=[
      null,[],
      {...baseline,membershipCount:'1'},
      {...baseline,membershipCount:0},
      {...baseline,sessionLogin:'postgres'},
      {...baseline,effectiveRole:'postgres'},
      {...baseline,canLogin:false},
      {...baseline,canBypassRls:'false'},
      {...baseline,isSuperuser:1},
      {...baseline,unknownProviderCredential:'secret'},
    ];
    for(const value of bad)expect(
      ()=>validatePrivateCancelExecutionLoginPreflightV1(value,ROLE),
    ).toThrow();
    const missing=zeroAuthority();
    delete missing.canDirectReview;
    expect(()=>validatePrivateCancelExecutionLoginPreflightV1(missing,ROLE))
      .toThrow('DENIED');
    expect(()=>validatePrivateCancelExecutionLoginPreflightV1(
      baseline,'myeongha_api_executor',
    )).toThrow('invalid');
  });
  it('cannot convert a signed review into a runnable DB executor',()=>{
    const ok=validatePrivateCancelExecutionLoginPreflightV1(zeroAuthority(),ROLE);
    expect(ok.signedReviewAuthorized).toBe(false);
    expect(ok.directReviewAuthorized).toBe(false);
    expect(ok.effectAuthorized).toBe(false);
  });
});
