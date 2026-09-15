import { createRoot } from 'react-dom/client';
import { AuthPage } from './AuthPage.js';

const authRoot = document.getElementById('auth-react-root');

if (!(authRoot instanceof HTMLElement)) {
  throw new Error('Missing Auth page element: auth-react-root');
}

createRoot(authRoot).render(<AuthPage />);
