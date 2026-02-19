import React from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './Widget.js';

// ---------------------------------------------------------------------------
// Auto-mount: find the script tag and read data attributes
// ---------------------------------------------------------------------------

function mount() {
  // Find our script tag (last script with data-tenant or the current script)
  const scripts = document.querySelectorAll('script[data-tenant]');
  const scriptTag = scripts[scripts.length - 1];

  const tenant = scriptTag?.getAttribute('data-tenant') ?? '';
  const position = (scriptTag?.getAttribute('data-position') ?? 'bottom-right') as
    | 'bottom-right'
    | 'bottom-left';
  const theme = (scriptTag?.getAttribute('data-theme') ?? 'light') as 'light' | 'dark';
  const apiUrl =
    scriptTag?.getAttribute('data-api-url') ??
    // Default: same origin as the script was loaded from
    new URL('/', scriptTag?.getAttribute('src') ?? window.location.href).origin;

  if (!tenant) {
    console.error('[CamelloWidget] Missing data-tenant attribute');
    return;
  }

  // Create a shadow-isolated container
  const container = document.createElement('div');
  container.id = 'camello-widget-root';
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <Widget tenant={tenant} position={position} theme={theme} apiUrl={apiUrl} />,
  );
}

// Mount when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
