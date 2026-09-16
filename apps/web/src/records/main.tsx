import { createRoot } from 'react-dom/client';
import { RecordsPage } from './RecordsPage.js';

const recordsRoot = document.getElementById('records-react-root');

if (!(recordsRoot instanceof HTMLElement)) {
  throw new Error('Missing Records page element: records-react-root');
}

createRoot(recordsRoot).render(<RecordsPage />);
