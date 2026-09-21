import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PhysiognomyPage } from './PhysiognomyPage.js';
import { createPhysiognomyPageApiFE032 } from './page-api-fe032.js';

declare global {
  interface Window {
    __MHA_FACE_PREVIEW_ENGINE_LOADER_FE032__?: () => Promise<unknown>;
  }
}

const loadEngineModule = async (): Promise<unknown> => {
  const loader = window.__MHA_FACE_PREVIEW_ENGINE_LOADER_FE032__;
  if (typeof loader !== 'function') {
    throw new Error('FACE_PREVIEW_ENGINE_DELIVERY_UNAVAILABLE');
  }
  return loader();
};

const api = createPhysiognomyPageApiFE032({ loadEngineModule });
const root = document.getElementById('face-reading-react-root');

if (root === null) {
  throw new Error('Missing #face-reading-react-root');
}

createRoot(root).render(
  <StrictMode>
    <PhysiognomyPage api={api} />
  </StrictMode>,
);
