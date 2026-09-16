import { createRoot } from 'react-dom/client';
import { MyPage } from './MyPage.js';

const myRoot = document.getElementById('my-react-root');

if (!(myRoot instanceof HTMLElement)) {
  throw new Error('Missing My page element: my-react-root');
}

createRoot(myRoot).render(<MyPage />);
