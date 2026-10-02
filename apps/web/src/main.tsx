import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { applyDocumentLocale, resolveDocumentLocale } from './app/i18n/locale';

// Before the first render: the page starts in its language and direction, not English then
// flipped (`<LocaleProvider>` keeps it in step afterwards; no inline script under the CSP).
applyDocumentLocale(resolveDocumentLocale().locale);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
