import type { ReaderSceneControllerStateV1 } from '../../reader-scene-controller.js';
import { resolveCharacterDisplayNameV1 } from '../../character-display-locale.js';

import './ReaderScenePanel.css';

// This is an inert UI consumer, not an endpoint/route/admission. It is only
// for a server-authorized ReaderSceneControllerV1 state supplied by its owner.
// The UI preference changes labels; it never authorizes Reader output locale.
const SCENE_UI_COPY = {
  'ko-KR': {
    title: '대리자 풀이',
    preview: '검증된 Reader 프리뷰',
    loading: '대리자의 풀이를 불러오는 중입니다.',
    idle: '표시할 대리자 풀이가 없습니다.',
    feature_unavailable: '현재 이 대리자 풀이는 제공되지 않습니다.',
    auth_required: '이 풀이를 보려면 현재 세션이 필요합니다.',
    access_denied: '현재 이 풀이를 열람할 권한이 없습니다.',
    retryable_error: '풀이를 불러오지 못했습니다. 다시 시도할 수 있습니다.',
    unavailable: '현재 이 풀이를 표시할 수 없습니다.',
    aborted: '풀이 불러오기를 종료했습니다.',
    protected_fallback: '보호 조건에 따라 이 대리자의 풀이를 표시하지 않습니다.',
    retry: '다시 시도',
  },
  'ja-JP': {
    title: '案内人の鑑定',
    preview: '確認済みの案内人プレビュー',
    loading: '案内人の鑑定を読み込んでいます。',
    idle: '表示できる案内人の鑑定はありません。',
    feature_unavailable: '現在、この案内人の鑑定は利用できません。',
    auth_required: 'この鑑定を表示するには有効なセッションが必要です。',
    access_denied: '現在、この鑑定の閲覧権限がありません。',
    retryable_error: '鑑定を読み込めませんでした。再試行できます。',
    unavailable: '現在、この鑑定を表示できません。',
    aborted: '鑑定の読み込みを終了しました。',
    protected_fallback: '保護条件により、この案内人の鑑定は表示されません。',
    retry: '再試行',
  },
  'zh-TW': {
    title: '引路人解讀',
    preview: '已確認的引路人預覽',
    loading: '正在載入引路人的解讀。',
    idle: '目前沒有可顯示的引路人解讀。',
    feature_unavailable: '目前尚未提供此引路人的解讀。',
    auth_required: '查看此解讀需要有效的登入工作階段。',
    access_denied: '目前沒有權限查看此解讀。',
    retryable_error: '無法載入解讀，可以再試一次。',
    unavailable: '目前無法顯示此解讀。',
    aborted: '已停止載入解讀。',
    protected_fallback: '依照保護規則，無法顯示此引路人的解讀。',
    retry: '重試',
  },
} as const;

export interface ReaderScenePanelProps {
  readonly state: ReaderSceneControllerStateV1;
  readonly onRetry?: () => void;
}

/**
 * Inert Reader Scene view. The caller must supply states from the existing
 * controller after server response parsing and authorization. No button opens
 * a Thread, purchases an entitlement, or selects a Reader from a UI hint.
 */
export function ReaderScenePanel({ state, onRetry }: ReaderScenePanelProps) {
  if (state.state === 'ready' || state.state === 'protected_fallback') {
    // UI copy is pegged to the original request's locale snapshot.
    const copy = SCENE_UI_COPY[state.uiLocale];
    const displayName = resolveCharacterDisplayNameV1(state.readerCharacterId, state.uiLocale)
      ?? state.presentation.name;

    return (
      <section
        className="reader-scene-panel"
        data-reader-scene-presentation
        data-reader-scene-state={state.state}
        data-reader-output-language="source_unasserted"
        data-reader-output-localized="false"
        aria-label={copy.title}
      >
        <header className="reader-scene-panel-header">
          <span>{copy.preview}</span>
          <h2>{displayName}</h2>
        </header>
        <p className="reader-scene-panel-source-notice" data-reader-scene-source-language-notice role="note">
          {state.sourceLanguageNotice}
        </p>
        {state.state === 'ready' ? (
          <div className="reader-scene-panel-segments" data-reader-scene-segments>
            {state.segments.map((segment, index) => (
              <p
                key={index}
                className="reader-scene-panel-segment"
                data-reader-scene-source-segment={segment.kind}
                data-reading-content
              >
                {segment.text}
              </p>
            ))}
          </div>
        ) : (
          <p className="reader-scene-panel-status" data-reader-scene-protected-fallback role="status">
            {copy.protected_fallback}
          </p>
        )}
      </section>
    );
  }

  // Non-ready states are authored UI status only: never reuse a previous
  // reader identity or response when access/session changes.
  const copy = SCENE_UI_COPY['ko-KR'];
  const status = state.state;
  return (
    <section className="reader-scene-panel" data-reader-scene-presentation data-reader-scene-state={status} aria-label={copy.title}>
      <p className="reader-scene-panel-status" role="status">{copy[status]}</p>
      {status === 'retryable_error' && state.canRetry && onRetry ? (
        <button type="button" className="reader-scene-panel-retry" onClick={onRetry}>
          {copy.retry}
        </button>
      ) : null}
    </section>
  );
}
