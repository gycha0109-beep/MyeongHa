import { useEffect, useRef, useState } from 'react';
import { readMemberCreditWalletV1, type CreditWalletViewV1 } from './read-credit-wallet.js';

export type CreditDialogReason = 'shortage' | 'manual';

const CREDIT_POLICY = Object.freeze({
  creditPerReply: 10,
  packCredits: 300,
  referencePriceWon: 1900,
  referenceReplies: 30,
});

// Commerce has no admitted public wallet / offer / checkout endpoint yet.
// This presentation must never pretend that reference policy equals a saleable offer.
export const CREDIT_RECHARGE_PUBLIC_CHECKOUT_ACTIVE = false;

export function CreditRechargeDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const seenTurnIds = useRef(new Set<string>());
  const [reason, setReason] = useState<CreditDialogReason>('manual');
  const [wallet, setWallet] = useState<CreditWalletViewV1 | null>(null);

  useEffect(() => {
    const open = (nextReason: CreditDialogReason, turnId?: string) => {
      if (nextReason === 'shortage' && turnId) {
        if (seenTurnIds.current.has(turnId)) return;
        seenTurnIds.current.add(turnId);
      }
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setReason(nextReason);
      setWallet(null);
      dialog.showModal();
      void readMemberCreditWalletV1().then(value=>setWallet(value)).catch(()=>setWallet(null));
    };
    const manual = () => open('manual');
    const shortage = (event: Event) => {
      const detail = (event as CustomEvent<{ turnId?: string }>).detail;
      open('shortage', typeof detail?.turnId === 'string' ? detail.turnId : undefined);
    };
    document.addEventListener('myeongha:credit-menu', manual);
    document.addEventListener('myeongha:credit-shortage', shortage);
    const dialog = dialogRef.current;
    const restoreFocus = () => { openerRef.current?.focus(); };
    dialog?.addEventListener('close', restoreFocus);
    return () => {
      document.removeEventListener('myeongha:credit-menu', manual);
      document.removeEventListener('myeongha:credit-shortage', shortage);
      dialog?.removeEventListener('close', restoreFocus);
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="credit-recharge-dialog"
      aria-labelledby="credit-dialog-title" aria-describedby="credit-dialog-description"
      data-credit-recharge-dialog>
      <div className="credit-dialog-content">
        <span className="credit-dialog-eyebrow">MYEONGHA · CREDIT</span>
        <button type="button" className="credit-dialog-close"
          aria-label="충전 안내 닫기" onClick={() => dialogRef.current?.close()}>×</button>
        <h2 id="credit-dialog-title">{reason === 'shortage' ? '크레딧이 부족해요' : '크레딧·충전 안내'}</h2>
        <p id="credit-dialog-description">
          {reason === 'shortage'
            ? '이야기를 계속하려면 크레딧이 필요합니다. 작성한 메시지는 그대로 남아 있습니다.'
            : '크레딧 이용 정책과 충전 준비 상태를 확인해 주세요.'}
        </p>

        {wallet === null ? (<dl className="credit-dialog-facts">
          <div><dt>현재 사용 가능한 크레딧</dt><dd>조회 미연결</dd></div>
          <div><dt>응답 1회 필요량 · 승인 정책</dt><dd>{CREDIT_POLICY.creditPerReply} 크레딧</dd></div>
        </dl>) : (
          <dl className="credit-dialog-facts">
            <div><dt>사용 가능 크레딧</dt><dd>{wallet.operatorFreeChat ? '운영자 무료 이용' : wallet.availableCredits + ' 크레딧'}</dd></div>
            <div><dt>AI 답변 1회</dt><dd>{wallet.operatorFreeChat ? '크레딧 차감 없음' : wallet.requiredCredits + ' 크레딧'}</dd></div>
          </dl>
        )}
        <div className="credit-dialog-offer" aria-label="판매 준비 중인 충전 정책">
          <div><strong>{CREDIT_POLICY.packCredits} 크레딧</strong><span>승인된 정책 기준 · 판매 준비 중</span></div>
          <strong>{CREDIT_POLICY.referencePriceWon.toLocaleString('ko-KR')}원</strong>
          <p>정책상 약 {CREDIT_POLICY.referenceReplies}회 응답 분량입니다. 실제 구매 가능 상품·잔액은 서버 연결 후 표시됩니다.</p>
        </div>
        <p className="credit-dialog-hold" role="status">
          현재 충전 결제 및 잔액 조회가 연결되지 않았습니다. 결제가 이루어지거나 크레딧이 지급되지 않습니다.
        </p>
        <div className="credit-dialog-actions">
          <button type="button" className="credit-dialog-buy" disabled={!CREDIT_RECHARGE_PUBLIC_CHECKOUT_ACTIVE}
            title="정식 충전 상품과 서버 결제 연결 준비 중">크레딧 충전하기</button>
          <button type="button" className="credit-dialog-later" onClick={() => dialogRef.current?.close()} autoFocus>나중에 하기</button>
        </div>
      </div>
    </dialog>
  );
}
