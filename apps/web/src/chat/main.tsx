import { createRoot } from 'react-dom/client';
import { ChatPage } from './ChatPage.js';

const chatRoot = document.getElementById('chat-react-root');

if (!(chatRoot instanceof HTMLElement)) {
  throw new Error('Missing Character Room element: chat-react-root');
}

createRoot(chatRoot).render(<ChatPage />);
