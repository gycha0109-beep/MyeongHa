import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HomePage } from './HomePage.js';

const homeRoot = document.getElementById('home-react-root');

if (!(homeRoot instanceof HTMLElement)) {
  throw new Error('Missing Home page element: home-react-root');
}

createRoot(homeRoot).render(
  <StrictMode>
    <HomePage />
  </StrictMode>,
);
