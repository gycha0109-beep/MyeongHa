import { createRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage.js';

const landingRoot = document.getElementById('landing-react-root');

if (!(landingRoot instanceof HTMLElement)) {
  throw new Error('Missing Landing element: landing-react-root');
}

createRoot(landingRoot).render(<LandingPage />);
