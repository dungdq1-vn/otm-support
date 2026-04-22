import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Fix for environments where something tries to overwrite read-only window.fetch
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  if (originalFetch) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'fetch');
      if (desc && !desc.configurable && desc.get) {
        console.warn('window.fetch is a read-only getter. Preventing potential polyfill overwrite errors.');
      }
    } catch (e) {
      // Ignore
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
