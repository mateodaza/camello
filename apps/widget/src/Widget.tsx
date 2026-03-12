import React, { useState } from 'react';
import { ChatBubble } from './components/ChatBubble.js';
import { ChatWindow } from './components/ChatWindow.js';
import { useWidgetSession } from './hooks/useWidgetSession.js';

export interface WidgetProps {
  tenant: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark';
  apiUrl: string;
}

export function Widget({ tenant, position, theme, apiUrl }: WidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const session = useWidgetSession(tenant, apiUrl);

  // DB config wins once loaded; fall back to HTML data-attribute until session resolves
  const resolvedPosition = session.token ? session.branding.position : position;
  const primaryColor = session.branding.primaryColor;

  return (
    <>
      {isOpen && session.token && (
        <ChatWindow
          token={session.token}
          tenantName={session.tenantName}
          artifactName={session.artifactName}
          language={session.language}
          apiUrl={apiUrl}
          position={resolvedPosition}
          theme={theme}
          primaryColor={primaryColor}
          onClose={() => setIsOpen(false)}
        />
      )}
      <ChatBubble
        position={resolvedPosition}
        theme={theme}
        language={session.language}
        isOpen={isOpen}
        isLoading={session.isLoading}
        primaryColor={primaryColor}
        onClick={() => {
          if (!session.token && !session.isLoading) {
            session.init();
          }
          setIsOpen((prev) => !prev);
        }}
      />
    </>
  );
}
