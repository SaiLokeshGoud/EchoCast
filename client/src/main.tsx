import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register Service Worker for PWA support (offline shell caching, bypasses audio streaming)
if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost') && window.location.protocol !== 'http:') {
  // Production / HTTPS / non-local
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[EchoCast SW] Registration error:', err);
    });
  });
} else if ('serviceWorker' in navigator) {
  // Local network / LAN development
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[EchoCast SW] Registration error:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
