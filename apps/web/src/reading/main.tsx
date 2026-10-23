import { resolveDevPlannedUiPreviewLocaleV1 } from '../ui/planned-ui-screen-preview-v1.js';
import { createRoot } from 'react-dom/client';
import { ReadingPage } from './ReadingPage.js';

const readingRoot = document.getElementById('reading-react-root');

if (!(readingRoot instanceof HTMLElement)) {
  throw new Error('Missing Saju Reading page element: reading-react-root');
}

createRoot(readingRoot).render(<ReadingPage previewLocale={resolveDevPlannedUiPreviewLocaleV1(window.location.search, import.meta.env.DEV)} />);
