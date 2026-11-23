import { useEffect, useRef, useState } from 'react';
import {
  APPROVED_SAJU_CATALOG_V1, getApprovedSajuOfferV1, SAJU_READING_COMPONENTS_V1,
} from '../../../../packages/contracts/src/approved-saju-catalog.js';
import type { ApprovedSajuPurchaseReadingV1 } from '../../../../packages/api-client/src/records.js';
import { buildPersistedReadingHandoffUrlV1 } from '../../reading-history-handoff.js';
import {
  prepareApprovedSajuSandboxCheckoutV1, requestApprovedSajuSandboxPaymentV1,
  type ApprovedSajuCheckoutPanelPorts, type ApprovedSajuSignedPairArchiveV1,
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

function archiveStatus(items: readonly ApprovedSajuPurchaseReadingV1[], offerId: Binding['approvedOfferId']) {
  const offer = getApprovedSajuOfferV1(offerId);
  if (!offer || items.length < offer.components.length) {
    return '현재 열람 권한이 있는 풀이만 표시합니다. 구매 권한과 상대 동의를 확인해 주세요.';
  }
  return offer.components.every(component => items.some(item => item.component === component && item.state === 'ready'))
    ? '구매한 정식 풀이가 모두 발급됐습니다. 아래에서 바로 확인할 수 있습니다.'
    : '결제 확인 완료. 정식 풀이를 발급 중이며 자동으로 상태를 확인합니다.';
}

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
  const [signedPair, setSignedPair] = useState<ApprovedSajuSignedPairArchiveV1 | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const retryKey = useRef<string | null>(null);
  const appliedSelection = useRef<number | null>(null);
  useEffect(() => {
    if (!selection || inFlight.current || appliedSelection.current === selection.sequence
      || !getApprovedSajuOfferV1(selection.offerId)) return;
    appliedSelection.current = selection.sequence;
    setOfferId(selection.offerId);
    setTargetId('');
    setBinding(null);
    setVerified(false);
    setVerifyOnly(false);
    setArchive([]);
    setSignedPair(null);
    setRefunded(false);
    setMessage('');
    retryKey.current = null;
  }, [selection?.sequence, busy]);
  const offer = getApprovedSajuOfferV1(offerId);
  const needsTarget = offer?.counterpartOrder !== undefined;
  const pollingWindow = useRef<{ purchaseIntentId: string; openedAt: number; failed: number } | null>(null);

  // Official Readings are signed asynchronously after the verified payment.
  // Continue checking the already-authorized, purchase-scoped archive until
  // every purchased component is issued. Never create another payment attempt.
  useEffect(() => {
    if (!verified || !binding || ports.readArchive === undefined
      || !archive.some(item => item.state === 'pending')) return;
    const { purchaseIntentId, approvedOfferId } = binding;

    if (pollingWindow.current?.purchaseIntentId !== purchaseIntentId) {
      pollingWindow.current = { purchaseIntentId, openedAt: Date.now(), failed: 0 };
    }
    if (Date.now() - pollingWindow.current.openedAt >= 120_000
      || pollingWindow.current.failed >= 3) {
      setMessage('발급이 지연되고 있습니다. 보관함에서 다시 확인할 수 있습니다.');
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active) return;
      if (document.visibilityState === 'hidden') {
        // Avoid unnecessary polling while the owner is away from the page.
        setArchive(current => [...current]);
        return;
      }
      try {
        const current = await ports.readArchive!(purchaseIntentId);
        if (!active) return;
        if (pollingWindow.current?.purchaseIntentId !== purchaseIntentId) return;
        pollingWindow.current.failed = 0;
        setArchive(current);
        setSignedPair(pair => current.some(item => item.state === 'ready' && item.readingId === pair?.readingId) ? pair : null);
        setMessage(archiveStatus(current, approvedOfferId));
      } catch {
        if (!active || pollingWindow.current?.purchaseIntentId !== purchaseIntentId) return;
        pollingWindow.current.failed++;
        setMessage('발급 상태 조회를 재시도 중입니다. 추가 결제는 진행되지 않습니다.');
        setArchive(current => [...current]);
      }
    }, 4_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [verified, binding, archive, ports]);

  async function loadArchive({ purchaseIntentId, approvedOfferId }: Binding) {
    setSignedPair(null);
    if (ports.readArchive === undefined) {
      setMessage('테스트 결제를 확인했습니다.');
      return;
    }
    try {
      const items = await ports.readArchive(purchaseIntentId);
      setArchive(items);
      setMessage(archiveStatus(items, approvedOfferId));
    } catch {
      setArchive([]);
      setMessage('보관함을 아직 열 수 없습니다. 발급 상태를 다시 확인해 주세요.');
    }
  }

  async function openSignedPair(item: ApprovedSajuPurchaseReadingV1) {
    if (!binding || item.state !== 'ready' || item.component !== 'compatibility'
      || !ports.readSignedPair || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const purchaseIntentId = binding.purchaseIntentId;
    try {
      const result = await ports.readSignedPair({
        purchaseIntentId, readingId: item.readingId,
        readerCharacterId: item.readerCharacterId,
      });
      setSignedPair(result);
      setMessage('구매 권한과 원본 서명을 확인한 궁합 풀이입니다.');
    } catch {
      setSignedPair(null);
      setMessage('서명된 궁합 원문을 열 수 없습니다. 구매 권한과 상대 동의를 확인해 주세요.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function requestTestRefund() {
    if (!binding || !verified || !ports.requestRefund || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await ports.requestRefund(binding.purchaseIntentId);
      if (result.state === 'refund_reconciled') {
        setRefunded(true);
        setArchive([]);
        setSignedPair(null);
        setMessage('포트원 TEST 전체 취소를 확인하고 구매한 풀이 권한을 회수했습니다.');
      } else if (result.state === 'request_submitted') {
        setMessage('TEST 취소가 접수됐습니다. 완료 여부를 확인한 후 권한을 회수합니다.');
      } else if (result.state === 'reconciliation_required') {
        setMessage('TEST 취소 요청 결과를 확인 중입니다. 중복 요청하지 않고 기존 취소 확인을 이용해 주세요.');
      } else {
        setMessage('전액 취소 조건을 충족하지 않아 TEST 취소 요청을 진행하지 않았습니다.');
      }
    } catch {
      setMessage('TEST 취소 요청을 확인할 수 없습니다. 중복 결제 취소는 자동으로 실행되지 않습니다.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function reconcileExistingRefund() {
    if (!binding || !verified || !ports.reconcileRefund || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await ports.reconcileRefund(binding.purchaseIntentId);
      if (response.state === 'refund_reconciled') {
        setRefunded(true);
        setArchive([]);
        setSignedPair(null);
        setMessage('포트원 TEST 전체 취소 확인. 구매한 풀이의 열람 권한을 회수했습니다.');
      } else {
        setMessage('포트원에서 전체 취소가 완료되지 않았습니다. 취소 완료 후 다시 확인해 주세요.');
      }
    } catch {
      setMessage('포트원 TEST 취소를 확인하지 못했습니다. 결제 정보가 변경되지는 않았습니다.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function continueCheckout() {
    if (!offer || refunded || inFlight.current || (needsTarget && !targetId)) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (verified && binding !== null) {
        await loadArchive(binding);
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
      await loadArchive(current);
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
    setSignedPair(null);
    setRefunded(false);
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
        {(!refunded && (!verified || ports.readArchive !== undefined)) && (
          <button className="saju-primary-button" type="submit" disabled={busy || !offer || (needsTarget && !targetId)}>
            {busy ? '확인 중…' : verified ? '보관함 상태 다시 확인' : verifyOnly ? '결제 확인 다시 시도' : '결제창 열기'}
          </button>
        )}
        {verified && !refunded && ports.requestRefund && (
          <button type="button" disabled={busy} onClick={() => { void requestTestRefund(); }}>
            포트원 TEST 결제 전체 취소 요청
          </button>
        )}
        {verified && !refunded && ports.reconcileRefund && (
          <button type="button" disabled={busy} onClick={() => { void reconcileExistingRefund(); }}>
            포트원 TEST 전체 취소 확인 · 열람 권한 회수
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
              {item.state === 'ready' && item.component === 'compatibility' && ports.readSignedPair && (
                <button type="button" disabled={busy} onClick={() => { void openSignedPair(item); }}>
                  원본 서명 확인하고 궁합 보기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {signedPair && (
        <section aria-label="원본 서명 확인된 궁합 풀이">
          <h3>원본 서명이 확인된 궁합 풀이</h3>
          {signedPair.display.steps.map((step, index) => (
            <div key={index}>
              <h4>{step.title}</h4>
              <p>{step.primary}</p>
              {step.supporting.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
              {step.structure.map((evidence, i) => <p key={i}>{evidence}</p>)}
            </div>
          ))}
          {signedPair.display.notices.map((notice, index) => <p key={index}>{notice}</p>)}
        </section>
      )}
    </section>
  );
}
