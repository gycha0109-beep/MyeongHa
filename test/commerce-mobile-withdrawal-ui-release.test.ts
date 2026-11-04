import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('mobile paid Reading withdrawal staged release',()=>{
  it('hides the consumer panel by default and requires Member',()=>{
    const singleton=read('apps/mobile/src/features/my/native-mobile-withdrawal-claim-service.ts');
    const screen=read('apps/mobile/src/app/(tabs)/my/index.tsx');
    expect(singleton).toContain("EXPO_PUBLIC_MYEONGHA_WITHDRAWAL_REQUEST_ENABLED === '1'");
    expect(singleton).toContain('enabled: MOBILE_WITHDRAWAL_CLAIM_UI_ENABLED_V1');
    expect(screen).toContain("currentAccount === 'member'");
    expect(screen).toContain('MOBILE_WITHDRAWAL_CLAIM_UI_ENABLED_V1');
    expect(screen).toContain('<MobileWithdrawalClaimPanel />');
    expect(screen).not.toContain('fetch(');
    expect(screen).not.toContain('Authorization');
    expect(screen).not.toContain('SecureStore');
  });
  it('retains a retry nonce, validates order pairs, and clears on credential switch',()=>{
    const form=read('apps/mobile/src/features/my/MobileWithdrawalClaimPanel.tsx');
    expect(form).toContain("const [nonce,setNonce]=useState<string|null>(null)");
    expect(form).toContain('requestNonce=crypto.randomUUID()');
    expect(form).not.toContain('Math.random');
    expect(form).toContain('subscribeMobileSubjectCredentialChangesV1');
    expect(form).toContain('setAccepted(null)');
    expect(form).toContain('epoch.current+=1');
    expect(form).toContain('UUID.test(purchase.trim())');
    expect(form).toContain('UUID.test(unit.trim())');
    expect(form).toContain('nativeMobileWithdrawalClaimServiceV1.submit');
    expect(form).toContain('nativeMobileWithdrawalClaimServiceV1.readStatus');
    expect(form).toContain('접수는 환불 승인이 아닙니다');
    expect(form).not.toContain('fetch(');
    expect(form).not.toContain('Authorization');
  });
});
