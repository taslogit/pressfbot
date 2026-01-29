import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Log initialization
console.log('[index.tsx] Starting app initialization...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('[index.tsx] Failed to find root element');
  throw new Error('Failed to find the root element');
}

console.log('[index.tsx] Root element found, creating React root...');

try {
  const root = ReactDOM.createRoot(rootElement);
  console.log('[index.tsx] React root created, rendering App...');
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  console.log('[index.tsx] App rendered successfully');
} catch (error) {
  console.error('[index.tsx] Error rendering app:', error);
  rootElement.innerHTML = `
    <div style="padding: 20px; color: white; background: #0f0d16; min-height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column;">
      <h1 style="color: #ff4dd2; margin-bottom: 20px;">Failed to load application</h1>
      <p style="color: #9ca3af; margin-bottom: 20px;">An error occurred while initializing the app.</p>
      <pre style="background: #1a1720; padding: 15px; border-radius: 8px; overflow: auto; max-width: 90%; max-height: 300px; color: #ff4dd2; font-size: 12px;">${error instanceof Error ? error.toString() : String(error)}</pre>
      <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #B4FF00; color: black; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Reload Page</button>
    </div>
  `;
}