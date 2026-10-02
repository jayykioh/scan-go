import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import {initMonitoring} from './services/monitoring.ts';
import './index.css';

// Error monitoring stays disabled without VITE_SENTRY_DSN (NFR-OBS-001).
initMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
