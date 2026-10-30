import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const load = (name: string) => readFile(new URL('../apps/web/' + name, import.meta.url), 'utf8');

describe('Web credit guidance and free Saju contract', () => {
  it('keeps all recharge action unavailable until a saleable server checkout exists', async () => {
    const [dialog, chat, runtime, css, html] = await Promise.all([
      load('src/commerce/CreditRechargeDialog.tsx'),
      load('src/chat/ChatPage.tsx'),
      load('chat-runtime-client.js'),
      load('credit-recharge.css'),
      load('chat.html'),
    ]);
    expect(dialog).toContain('CREDIT_RECHARGE_PUBLIC_CHECKOUT_ACTIVE = false');
    expect(dialog).toContain('disabled={!CREDIT_RECHARGE_PUBLIC_CHECKOUT_ACTIVE}');
    expect(dialog).toContain('현재 사용 가능한 크레딧');
    expect(dialog).toContain('readMemberCreditWallet');
    expect(dialog).toContain("fetch('/api/me/credits'");
    expect(dialog).toContain('관리자 · 크레딧 차감 없음');
    expect(dialog).toContain('판매 준비 중');
    expect(dialog).toContain("dialog.showModal()");
    expect(dialog).toContain("openerRef.current?.focus()");
    expect(chat).toContain('<CreditRechargeDialog />');
    expect(chat).toContain("myeongha:credit-menu");
    expect(html).toContain('credit-recharge.css');
    expect(css).toContain('credit-recharge-dialog::backdrop');
    expect(runtime).toContain("error.code === 'INSUFFICIENT_CREDITS' || error.code === 'CREDIT_INSUFFICIENT'");
    expect(runtime).toContain("myeongha:credit-shortage");
    expect(runtime).toContain('turnId: pendingTurn.clientTurnId');
    expect(runtime).toContain("messageInput.value = ''");
    const runtimeNormalized = runtime.replace(/\r\n/gu, '\n');
    expect(runtimeNormalized.indexOf("messageInput.value = ''")).toBeLessThan(
      runtimeNormalized.indexOf('} catch (error) {\n    const code = error instanceof Error ? error.message'),
    );
    expect(dialog).not.toContain('requestPayment(');
    expect(dialog).not.toContain('purchase-intent');
  });

  it('uses the existing Saju calculation and product discovery without exposing client-side checkout authority', async () => {
    const [page, hub, admission] = await Promise.all([
      load('src/reading/ReadingPage.tsx'),
      load('saju-hub.js'),
      load('saju-preview-response-admission.js'),
    ]);
    for (const field of ['saju-birth-summary','saju-pillar-grid','saju-day-master','saju-element-bars','saju-completeness-copy']) {
      expect(page).toContain(field);
    }
    expect(page).not.toContain('saju-design-ribbon');
    expect(page).toContain('나의 사주 기본 정보');
    expect(page).toContain('saju-design-birth-fields');
    expect(page).toContain('saju-design-chart-tabs');
    expect(page).toContain('사주 해석 상품');
    expect(page).toContain('sajuProductTopics.map');
    expect(page).toContain('보고서 구성 미리보기');
    expect(page).toContain('상품별 제공 조건과 가격은 실제 상품 계약을 따릅니다.');
    expect(page).toContain('reading-detail.html?topic=love');
    expect(page).toContain('reading-topic-availability is-');
    expect(page).not.toContain('requestPayment(');
    expect(page).not.toContain('gm-chart-details');
    expect(page).not.toContain('disabled={!CREDIT_RECHARGE_PUBLIC_CHECKOUT_ACTIVE}');
    expect(page).not.toContain('product_offer_id');
    expect(page).not.toContain('entitlement: true');
    expect(hub).toContain("const SAJU_CALCULATION_ENDPOINT = '/api/me/saju/calculation'");
    expect(admission).toContain("payload.data.lifecycle !== 'preview'");
  });
});
