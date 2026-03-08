import React from 'react';

interface TypingIndicatorProps {
  isDark: boolean;
}

export function TypingIndicator({ isDark }: TypingIndicatorProps) {
  return (
    <div
      style={{
        marginBottom: '10px',
        display: 'flex',
        justifyContent: 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: '12px',
          backgroundColor: isDark ? '#0f3460' : '#f3f4f6',
          color: isDark ? '#e0e0e0' : '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
        }}
      >
        <span className="camello-typing-dot" />
        <span className="camello-typing-dot" />
        <span className="camello-typing-dot" />
      </div>
    </div>
  );
}
