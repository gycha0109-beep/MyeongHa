import { useEffect, useRef, useState } from 'react';
import {
  APPROVED_SAJU_CATALOG_V1, getApprovedSajuOfferV1, SAJU_READING_COMPONENTS_V1,
} from '../../../../packages/contracts/src/approved-saju-catalog.js';
import type { ApprovedSajuPurchaseReadingV1 } from '../../../../packages/api-client/src/records.js';
import { buildPersistedReadingHandoffUrlV1 } from '../../reading-history-handoff.js';
import {
  prepareApprovedSajuSandboxCheckoutV1, requestApprovedSajuSandboxPaymentV1,
  type ApprovedSajuCheckoutPanelPorts,
} from './approved-saju-sandbox-checkout.js';
import {
  fetchPaymentAttemptServerVerificationV1, PaymentAttemptBrowserServerVerificationTransportErrorV1,
} from './payment-attempt-browser-server-verification-transport.js';

type Binding = Awaited<ReturnType<typeof prepareApprovedSajuSandboxCheckoutV1>>;
const GROUPS = [
  { type: 'single', label: '단품' },
  { type: 'comparison', label: '관계 비교' },
  { type: 'package', label: '패키지' },
] as const;
const PRICE = new Intl.NumberFormat('ko-KR');

/** Mounted only by the isolated runtime, which supplies authenticated ports. */
export function ApprovedSajuCheckoutPanel({ ports, selection }: {
  ports: ApprovedSajuCheckoutPanelPorts;
  selection?: Readonly<{ offerId: string; sequence: number }>;
}) {
  const [offerId, setOfferId] = useState(selection?.offerId ?? '');
  const [targetId, setTargetId] = useState('');
  const [binding, setBinding] = useState<Binding | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifyOnly, setVerifyOnly] = useState(false);
  const [archive, setArchive] = useState<readonly ApprovedSajuPurchaseReadingV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const retryKey = useRef<string | null>(null);
  useEffect(() => {
    if (!selection || inFlight.current || !getApprovedSajuOfferV1(selection.offerId)) return;
    setOfferId(selection.offerId);
    setTargetId('');
    setBinding(null);
    setVerified(false);
    setVerifyOnly(false);
    setArchive([]);
    setMessage('');
    retryKey.current = null;
  }, [selection?.sequence]);
  const offer = getApprovedSajuOfferV1(offerId);
  const needsTarget = offer?.counterpartOrder !== undefined;

  async function loadArchive(purchaseIntentId: string) {
    if (ports.readArchive === undefined) {
      setMessage('테스트 결제를 확인했습니다.');
      return;
    }
    try {
      setArchive(await ports.readArchive(purchaseIntentId));
      setMessage('보관함의 풀이 상태를 확인했습니다.');
    } catch {
      setArchive([]);
      setMessage('보관함을 아직 열 수 없습니다. 발급 상태를 다시 확인해 주세요.');
    }
  }

  async function continueCheckout() {
    if (!offer || inFlight.current || (needsTarget && !targetId)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (verified && binding !== null) {
        await loadArchive(binding.purchaseIntentId);
        return;
      }
      const current = binding ?? await prepareApprovedSajuSandboxCheckoutV1({
        approvedOfferId: offer.id, idempotencyKey: retryKey.current ??= crypto.randomUUID(),
        ...(needsTarget ? { targetPersonId: targetId } : {}),
        orders: ports.orders, attempts: ports.attempts,
      });
      setBinding(current);
      if (verifyOnly) {
        await fetchPaymentAttemptServerVerificationV1({
          paymentAttemptId: current.paymentAttemptId, fetchPort: ports.verification,
        });
      } else {
        await requestApprovedSajuSandboxPaymentV1({
          ...current, handoff: ports.handoff, verification: ports.verification, sdk: ports.sdk, channel: ports.channel,
        });
      }
      setVerified(true);
      await loadArchive(current.purchaseIntentId);
    } catch (error) {
      if (error instanceof PaymentAttemptBrowserServerVerificationTransportErrorV1) {
        setVerifyOnly(true);
        setMessage('결제 결과를 확인하지 못했습니다. 결제창을 다시 열지 않고 결제 확인을 다시 시도할 수 있습니다.');
      } else {
        setMessage('주문 또는 결제창을 준비하지 못했습니다. 같은 상품으로 다시 시도해 주세요.');
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function chooseAnotherOffer() {
    setOfferId('');
    setTargetId('');
    setBinding(null);
    setVerified(false);
    setVerifyOnly(false);
    setArchive([]);
    setMessage('');
    retryKey.current = null;
  }

  return (
    <section className="saju-design-products" aria-labelledby="approved-checkout-title" aria-busy={busy}>
      <h2 id="approved-checkout-title">사주 상품 결제 테스트</h2>
      <form onSubmit={(event) => { event.preventDefault(); void continueCheckout(); }}>
        <div className="saju-field">
          <label htmlFor="approved-saju-offer">상품</label>
          <select id="approved-saju-offer" value={offerId} disabled={busy || binding !== null} onChange={(event) => {
            setOfferId(event.target.value);
            setTargetId('');
            retryKey.current = null;
            setMessage('');
          }}>
            <option value="">상품을 선택하세요</option>
            {GROUPS.map(group => (
              <optgroup key={group.type} label={group.label}>
                {APPROVED_SAJU_CATALOG_V1.filter(item => item.type === group.type).map(item => (
                  <option key={item.id} value={item.id}>{item.title} · {PRICE.format(item.priceKrw)}원</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {needsTarget && (
          <div className="saju-field">
            <label htmlFor="approved-saju-target">비교할 상대</label>
            <select id="approved-saju-target" value={targetId} disabled={busy || binding !== null} onChange={(event) => {
              setTargetId(event.target.value);
              retryKey.current = null;
            }}>
              <option value="">상대를 선택하세요</option>
              {ports.targets.map(target => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </div>
        )}
        {(!verified || ports.readArchive !== undefined) && (
          <button className="saju-primary-button" type="submit" disabled={busy || !offer || (needsTarget && !targetId)}>
            {busy ? '확인 중…' : verified ? '보관함 상태 다시 확인' : verifyOnly ? '결제 확인 다시 시도' : '결제창 열기'}
          </button>
        )}
        {verified && <button type="button" disabled={busy} onClick={chooseAnotherOffer}>다른 상품 선택</button>}
      </form>
      <p role="status">{message}</p>
      {archive.length > 0 && (
        <ul aria-label="구매한 풀이">
          {archive.map(item => (
            <li key={item.component}>
              <span>{item.component === 'compatibility' ? '관계 비교'
                : getApprovedSajuOfferV1(item.component)?.title ?? SAJU_READING_COMPONENTS_V1[item.component].text}</span>{' '}
              {item.state === 'ready'
                ? <a href={buildPersistedReadingHandoffUrlV1(item)}>저장된 풀이 열기</a>
                : <span>발급 대기</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
