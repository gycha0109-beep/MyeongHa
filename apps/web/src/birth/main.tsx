import { createRoot } from 'react-dom/client';
import { BirthPage } from './BirthPage.js';

const birthRoot = document.getElementById('birth-react-root');

if (!(birthRoot instanceof HTMLElement)) {
  throw new Error('Missing Birth Profile page element: birth-react-root');
}

createRoot(birthRoot).render(<BirthPage />);
