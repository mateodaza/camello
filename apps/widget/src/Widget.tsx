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

  return (
    <>
      {isOpen && session.token && (
        <ChatWindow
          token={session.token}
          tenantName={session.tenantName}
          artifactName={session.artifactName}
          apiUrl={apiUrl}
          position={position}
          theme={theme}
          onClose={() => setIsOpen(false)}
        />
      )}
      <ChatBubble
        position={position}
        theme={theme}
        isOpen={isOpen}
        isLoading={session.isLoading}
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
