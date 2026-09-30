import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { ModerationErrorBoundary } from './error-boundary';
import { ModerationApp } from './moderation-app';
import './moderation.css';

// Entry of `moderation.html`, a separate Vite input: nothing here is reachable from the public
// site's `main.tsx`, so the public bundle carries no moderation code.
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <ModerationErrorBoundary>
      <ModerationApp />
    </ModerationErrorBoundary>
  </StrictMode>
);
