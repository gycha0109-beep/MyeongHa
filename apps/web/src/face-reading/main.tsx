import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PhysiognomyPage } from './PhysiognomyPage.js';
import { createPhysiognomyPageApiFE032 } from './page-api-fe032.js';
import { loadFacePreviewEngineFE033 } from './engine-loader-fe033.js';

const api = createPhysiognomyPageApiFE032({
  loadEngineModule: loadFacePreviewEngineFE033,
});
const root = document.getElementById('face-reading-react-root');

if (root === null) {
  throw new Error('Missing #face-reading-react-root');
}

createRoot(root).render(
  <StrictMode>
    <PhysiognomyPage api={api} />
  </StrictMode>,
);