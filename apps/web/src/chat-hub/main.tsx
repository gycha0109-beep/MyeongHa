import { resolveDevPlannedUiPreviewLocaleV1 } from '../ui/planned-ui-screen-preview-v1.js';
import { createRoot } from 'react-dom/client';
import { ChatHubPage } from './ChatHubPage.js';

const chatHubRoot = document.getElementById('chat-hub-react-root');

if (!(chatHubRoot instanceof HTMLElement)) {
  throw new Error('Missing Conversation hub element: chat-hub-react-root');
}

createRoot(chatHubRoot).render(<ChatHubPage previewLocale={resolveDevPlannedUiPreviewLocaleV1(window.location.search, import.meta.env.DEV)} />);
