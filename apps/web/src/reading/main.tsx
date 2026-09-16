import { createRoot } from 'react-dom/client';
import { ReadingPage } from './ReadingPage.js';

const readingRoot = document.getElementById('reading-react-root');

if (!(readingRoot instanceof HTMLElement)) {
  throw new Error('Missing Saju Reading page element: reading-react-root');
}

createRoot(readingRoot).render(<ReadingPage />);
