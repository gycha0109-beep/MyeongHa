import { resolveDevPlannedUiPreviewWithSessionV1, readDevPlannedUiPreviewSessionV1 } from '../ui/planned-ui-screen-preview-v1.js';
import { createRoot } from 'react-dom/client';
import { RecordsPage } from './RecordsPage.js';

const recordsRoot = document.getElementById('records-react-root');

if (!(recordsRoot instanceof HTMLElement)) {
  throw new Error('Missing Records page element: records-react-root');
}

createRoot(recordsRoot).render(<RecordsPage previewLocale={resolveDevPlannedUiPreviewWithSessionV1(window.location.search, import.meta.env.DEV, readDevPlannedUiPreviewSessionV1(import.meta.env.DEV))} />);
