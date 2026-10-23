import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import {
  plannedMobileUiPreviewLocaleV1,
  type MobilePlannedUiPreviewLocaleV1,
} from './mobile-planned-ui-screen-preview-v1.js';

type Selection = Readonly<{
  chosen: boolean;
  locale: MobilePlannedUiPreviewLocaleV1 | null;
}>;

type PreviewContextValue = Selection & Readonly<{
  select: (candidate: unknown) => void;
}>;

const defaultSelection: Selection = Object.freeze({ chosen: false, locale: null });
const context = createContext<PreviewContextValue>({
  ...defaultSelection,
  select: () => undefined,
});

/**
 * Ephemeral developer QA state, shared across all Expo routes.
 * Never persisted, sent to an API, or used as an official Reader locale.
 */
export function MobilePlannedUiPreviewProviderV1({ children }: PropsWithChildren) {
  const [selection, setSelection] = useState<Selection>(defaultSelection);
  const select = useCallback((candidate: unknown) => {
    if (!__DEV__) return;
    // An empty selection explicitly restores the active supported UI locale.
    if (candidate !== '' && candidate !== null &&
        plannedMobileUiPreviewLocaleV1(candidate, true) === null) return;
    setSelection({ chosen: true, locale: plannedMobileUiPreviewLocaleV1(candidate, true) });
  }, []);
  const value = useMemo<PreviewContextValue>(() => ({
    ...selection,
    select,
  }), [selection, select]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useMobilePlannedUiPreviewSelectionV1() {
  return useContext(context);
}

/** A route query is a one-time QA fallback; an explicit switcher choice wins. */
export function resolveMobilePlannedUiPreviewSelectionV1(
  routeQuery: unknown,
  selection: Selection,
  development: boolean,
): MobilePlannedUiPreviewLocaleV1 | null {
  if (!development) return null;
  if (selection.chosen) return selection.locale;
  return plannedMobileUiPreviewLocaleV1(routeQuery, true);
}
