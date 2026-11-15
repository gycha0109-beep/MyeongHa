import { useEffect, useState } from 'react';
import {
  createSharedMemoryClientV1,
  SharedMemoryClientErrorV1,
  type SharedMemoryItemV1,
} from './shared-memory-client.js';

const client = createSharedMemoryClientV1();
const MAX_TEXT = 500;
const MAX_ITEMS = 50;

export function SharedMemoryPanel({ canManage, t }: Readonly<{
  canManage: boolean;
  t: (source: string) => string;
}>) {
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [items, setItems] = useState<readonly SharedMemoryItemV1[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (!canManage) return;
    let mounted = true;
    void client.read().then(next => {
      if (!mounted) return;
      setItems(next);
      setUnavailable(false);
      setReadFailed(false);
      setError('');
    }).catch((cause: unknown) => {
      if (!mounted) return;
      if (cause instanceof SharedMemoryClientErrorV1 && cause.code === 'NOT_ENABLED') {
        setUnavailable(true);
        setReadFailed(false);
        setItems([]);
        setDraft('');
        setEditing(null);
        setEditText('');
        setError('');
        return;
      }
      setReadFailed(true);
      setItems([]);
      setDraft('');
      setEditing(null);
      setEditText('');
      setError('현재 메모리를 불러올 수 없습니다. 저장된 내용이 없다는 뜻은 아닙니다.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [canManage]);

  function fail(errorValue: unknown) {
    setSaved('');
    if (errorValue instanceof SharedMemoryClientErrorV1 && errorValue.code === 'SHARED_MEMORY_CONFLICT') {
      setError('다른 화면에서 메모리가 변경되었습니다. 화면을 새로 열어 다시 확인해 주세요.');
    } else if (errorValue instanceof SharedMemoryClientErrorV1 && errorValue.code === 'SHARED_MEMORY_FULL') {
      setError('공통 메모리는 최대 50개까지 등록할 수 있습니다.');
    } else {
      setError('요청을 처리하지 못했습니다. 저장 여부를 확인한 뒤 다시 시도해 주세요.');
    }
  }
  async function add() {
    if (busy || !draft.trim() || [...draft.trim()].length > MAX_TEXT || items.length >= MAX_ITEMS) return;
    setBusy(true); setError(''); setSaved('');
    try {
      const added = await client.add(draft.trim());
      setItems(current => [added, ...current]);
      setDraft(''); setSaved('메모리를 저장했습니다.');
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }
  async function update(item: SharedMemoryItemV1) {
    if (busy || !editText.trim() || [...editText.trim()].length > MAX_TEXT) return;
    setBusy(true); setError(''); setSaved('');
    try {
      const updated = await client.edit(item.id, editText.trim(), item.updatedAt);
      setItems(current => current.map(existing => existing.id === item.id ? updated : existing));
      setEditing(null); setEditText(''); setSaved('메모리를 수정했습니다.');
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }
  async function remove(item: SharedMemoryItemV1) {
    if (busy || !window.confirm(t('이 메모리를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.'))) return;
    setBusy(true); setError(''); setSaved('');
    try {
      await client.remove(item.id);
      setItems(current => current.filter(existing => existing.id !== item.id));
      setEditing(null); setSaved('메모리를 삭제했습니다.');
    } catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  if (!canManage) {
    return <p className="my-detail-hint">{t('공통 메모리는 로그인한 회원만 사용할 수 있습니다.')} <a href="auth.html?next=my.html">{t('로그인하기')}</a></p>;
  }
  if (unavailable) {
    return <p className="my-detail-hint" role="status">{t('공통 메모리는 아직 이용할 수 없습니다. 운영 검증 후 제공됩니다.')}</p>;
  }
  return (
    <div className="my-shared-memory" aria-live="polite">
      <p>{t('내가 직접 등록한 정보만 모든 캐릭터가 공통으로 참고합니다. 자동으로 기억을 저장하지 않습니다.')}</p>
      <p className="my-detail-hint">{t('이 목록은 대화 기록·사주 해석·캐릭터별 관계 기록과 별도로 관리됩니다.')}</p>
      {loading ? <p>{t('메모리를 불러오는 중입니다…')}</p> : null}
      {error ? <p role="alert" className="my-shared-memory-error">{t(error)}</p> : null}
      {saved ? <p role="status">{t(saved)}</p> : null}
      {!loading && !error && items.length === 0 ? <p className="my-detail-hint">{t('아직 등록한 공통 메모리가 없습니다.')}</p> : null}
      {!loading && !readFailed ? (
        <>
          <ul className="my-shared-memory-list">
            {items.map(item => (
              <li key={item.id} className="my-shared-memory-item">
                {editing === item.id ? (
                  <div className="my-shared-memory-editor">
                    <label htmlFor={'my-shared-memory-edit-' + item.id}>{t('메모리 수정')}</label>
                    <textarea id={'my-shared-memory-edit-' + item.id} value={editText}
                      disabled={busy} onChange={event => setEditText([...event.target.value].slice(0, MAX_TEXT).join(''))} />
                    <div className="my-shared-memory-actions">
                      <button type="button" disabled={busy || !editText.trim() || [...editText.trim()].length > MAX_TEXT} onClick={() => void update(item)}>{t('저장')}</button>
                      <button type="button" disabled={busy} onClick={() => { setEditing(null); setEditText(''); }}>{t('취소')}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="my-shared-memory-text">{item.text}</p>
                    <div className="my-shared-memory-actions">
                      <button type="button" disabled={busy} onClick={() => { setEditing(item.id); setEditText(item.text); setError(''); }}>{t('수정')}</button>
                      <button type="button" disabled={busy} onClick={() => void remove(item)}>{t('삭제')}</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form className="my-shared-memory-editor" onSubmit={event => { event.preventDefault(); void add(); }}>
            <label htmlFor="my-shared-memory-new">{t('새 메모리 등록')} ({items.length}/{MAX_ITEMS})</label>
            <textarea id="my-shared-memory-new" placeholder={t('예: 나는 고양이 두 마리를 키워요.')} value={draft}
              disabled={busy || items.length >= MAX_ITEMS}
              onChange={event => setDraft([...event.target.value].slice(0, MAX_TEXT).join(''))} />
            <div className="my-shared-memory-actions">
              <small>{[...draft].length}/{MAX_TEXT}</small>
              <button type="submit" disabled={busy || !draft.trim() || [...draft.trim()].length > MAX_TEXT || items.length >= MAX_ITEMS}>{t('메모리 추가')}</button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
