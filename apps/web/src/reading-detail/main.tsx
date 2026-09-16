import { createRoot } from 'react-dom/client';
import { ReadingDetailPage } from './ReadingDetailPage.js';

const readingDetailRoot = document.getElementById('reading-detail-react-root');

if (!(readingDetailRoot instanceof HTMLElement)) {
  throw new Error('Missing Reading detail page element: reading-detail-react-root');
}

createRoot(readingDetailRoot).render(<ReadingDetailPage />);
