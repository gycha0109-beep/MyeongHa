import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import * as executorModule from
  '../apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.js';
import * as identityModule from
  '../apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.js';
import * as adversarialTestIssuer from
  './support/private-official-reader-cancel-legacy-permit-issuer-v1.js';

describe('D3e13 offline cancellation permit issuance surface closure',()=>{
  it('never exports identity-unbound private-key signing from the runtime executor',()=>{
    const exported=Object.keys(executorModule);
    expect(exported).toContain('executeSandboxPrivateCancelReviewPermitV1');
    expect(exported).toContain('canonicalPrivateCancelDetachedPermitV1');
    expect(exported).toContain('validateSandboxPrivateCancelDetachedPayloadV1');
    expect(exported).not.toContain('issueSandboxPrivateCancelReviewPermitV1');
    expect(exported).not.toContain('issueIdentityBoundSandboxPrivateCancelPermitV1');
  });
  it('contains no private-key parsing, issuance or legacy issuer import in executor source',()=>{
    const code=readFileSync(
      'apps/api/src/official-reader-portone-cancel-detached-permit-private-v1.ts',
      'utf8',
    );
    expect(code).not.toMatch(/\bcreatePrivateKey\s*\(/u);
    expect(code).not.toMatch(/\bedSign\s*\(/u);
    expect(code).not.toMatch(/\bissuerPrivateKeyPem\b/u);
    expect(code).not.toMatch(/export function issueSandboxPrivateCancelReviewPermitV1/u);
    expect(code).not.toMatch(/test\/support\/private-official-reader-cancel-legacy-permit-issuer/u);
    expect(code).toContain('executeSandboxPrivateCancelReviewPermitV1');
    expect(code).toContain('validateSandboxPrivateCancelDetachedPayloadV1');
  });
  it('the only app-level issuer first verifies both identity assertions',()=>{
    expect(Object.keys(identityModule)).toContain(
      'issueIdentityBoundSandboxPrivateCancelPermitV1',
    );
    expect(Object.keys(identityModule)).not.toContain(
      'issueSandboxPrivateCancelReviewPermitV1',
    );
    const source=readFileSync(
      'apps/api/src/official-reader-portone-cancel-private-identity-attestation-v1.ts',
      'utf8',
    );
    const start=source.indexOf(
      'export function issueIdentityBoundSandboxPrivateCancelPermitV1(',
    );
    expect(start).toBeGreaterThan(0);
    const body=source.slice(start);
    const verifyAt=body.indexOf('verifyOfflinePrivateCancelIdentityPairV1(input)');
    const keyAt=body.indexOf('createPrivateKey(input.issuerPrivateKeyPem)');
    const signAt=body.indexOf('edSign(null,canonicalPrivateCancelDetachedPermitV1');
    expect(verifyAt).toBeGreaterThan(0);
    expect(keyAt).toBeGreaterThan(verifyAt);
    expect(signAt).toBeGreaterThan(keyAt);
    expect(source).not.toContain('issueSandboxPrivateCancelReviewPermitV1');
  });
  it('retains legacy raw signing exclusively for isolated negative test fixtures',()=>{
    expect(Object.keys(adversarialTestIssuer)).toEqual([
      'issueSandboxPrivateCancelReviewPermitV1',
    ]);
    const code=readFileSync(
      'test/support/private-official-reader-cancel-legacy-permit-issuer-v1.ts',
      'utf8',
    );
    expect(code).toContain('TEST SUPPORT ONLY');
    expect(code).toContain('verifyPrivateCancelDualSignaturesV1');
    expect(code).toContain('createPrivateKey');
    expect(code).toContain('canonicalPrivateCancelDetachedPermitV1');
  });
});
