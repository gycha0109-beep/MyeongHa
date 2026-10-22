import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createReaderSceneControllerV1,
  type ReaderSceneControllerInputV1,
  type ReaderSceneControllerStateV1,
  type ReaderSceneControllerV1,
} from '../../reader-scene-controller.js';
import type { ReaderRuntimeClientV1 } from '../../reader-runtime-client.js';
import { getUiLocale, normalizeUiLocale } from '../../ui-i18n.js';
import { ReaderScenePanel } from './ReaderScenePanel.js';

type DisplaySnapshot = Readonly<{
  client: ReaderRuntimeClientV1;
  key: string;
  state: ReaderSceneControllerStateV1;
}>;

const IDLE: ReaderSceneControllerStateV1 = Object.freeze({
  state: 'idle',
  canRetry: false,
});
const NOT_RELEASED: ReaderSceneControllerStateV1 = Object.freeze({
  state: 'feature_unavailable',
  canRetry: false,
  code: 'READER_FEATURE_UNAVAILABLE',
});

/**
 * Render-time gate. This is a visual stale-data barrier, NOT authorization.
 * The transport and the server still validate every live Reader request.
 */
export function selectReaderSceneDisplayStateV1(
  client: ReaderRuntimeClientV1,
  key: string | null,
  snapshot: DisplaySnapshot | null,
): ReaderSceneControllerStateV1 {
  if (!client.enabled) return NOT_RELEASED;
  if (key === null) return IDLE;
  if (snapshot?.client === client && snapshot.key === key) return snapshot.state;
  return { state: 'loading', canRetry: false, generation: 0 };
}

/**
 * Integration seam for a future owner-approved Reader Scene entry.
 *
 * ownerBinding must be obtained through the existing server-owned Thread /
 * Official Reading admission; this component never parses Records UI hints,
 * promotes a presentation character to authority, or enables the transport.
 *
 * displayScopeRevision is ONLY a UI invalidation token supplied by that owner.
 * It must change when the active subject, session, or grant changes. It cannot
 * grant access: ReaderRuntimeClientV1 and the server remain authoritative.
 */
export interface ReaderSceneBoundPanelProps {
  readonly client: ReaderRuntimeClientV1;
  readonly ownerBinding: ReaderSceneControllerInputV1 | null;
  readonly displayScopeRevision: string;
  readonly getUiLocale?: () => string;
}

function safeReadShellLocale(getCurrentUiLocale: () => string) {
  // The panel can be server-rendered as an inert shell; browser preference
  // storage is not available on the server.
  try { return normalizeUiLocale(getCurrentUiLocale()); }
  catch { return 'ko-KR'; }
}

export function ReaderSceneBoundPanel({
  client,
  ownerBinding,
  displayScopeRevision,
  getUiLocale: resolveUiLocale = getUiLocale,
}: ReaderSceneBoundPanelProps) {
  const controllerRef = useRef<ReaderSceneControllerV1 | null>(null);
  const resolveUiLocaleRef = useRef(resolveUiLocale);
  resolveUiLocaleRef.current = resolveUiLocale;
  const [snapshot, setSnapshot] = useState<DisplaySnapshot | null>(null);
  const [shellLocale, setShellLocale] = useState(() => safeReadShellLocale(resolveUiLocale));

  useEffect(() => {
    // Locale changes repaint only authored loading/error shell labels.
    // A ready result remains pinned to its request-start source snapshot.
    if (typeof document === 'undefined') return;
    const updateShellLocale = () => setShellLocale(safeReadShellLocale(resolveUiLocaleRef.current));
    document.addEventListener('myeongha:localechange', updateShellLocale);
    updateShellLocale();
    return () => document.removeEventListener('myeongha:localechange', updateShellLocale);
  }, []);

  const threadId = ownerBinding?.threadId ?? null;
  const officialReadingId = ownerBinding?.officialReadingId ?? null;
  // Scope revision is an invalidation key, never a source/permission token.
  const key = threadId === null || officialReadingId === null
    ? null
    : JSON.stringify([displayScopeRevision, threadId, officialReadingId]);

  useEffect(() => {
    if (!client.enabled || key === null || threadId === null || officialReadingId === null) {
      controllerRef.current = null;
      return;
    }

    let active = true;
    const controller = createReaderSceneControllerV1({
      client,
      getUiLocale: () => resolveUiLocaleRef.current(),
      onState: state => {
        if (active) setSnapshot({ client, key, state });
      },
    });
    controllerRef.current = controller;
    void controller.load({ threadId, officialReadingId });

    return () => {
      // Prevent stale replies from leaking across logout, account switches,
      // grant revocation, navigation, and StrictMode effect replays.
      active = false;
      if (controllerRef.current === controller) controllerRef.current = null;
      controller.cancel();
    };
  }, [client, key, threadId, officialReadingId]);

  const retry = useCallback(() => {
    if (client.enabled && key !== null) {
      // The original controller owns retry admission and UI-locale snapshots.
      void controllerRef.current?.retry();
    }
  }, [client, key]);

  // Render-time masking is essential: effect cleanup is asynchronous relative
  // to a new React render, so a prior person's source must not flash even once.
  const state = selectReaderSceneDisplayStateV1(client, key, snapshot);

  return (
    <ReaderScenePanel
      state={state}
      uiLocale={shellLocale}
      onRetry={retry}
    />
  );
}
