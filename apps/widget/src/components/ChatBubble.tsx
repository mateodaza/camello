import React from 'react';

interface ChatBubbleProps {
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark';
  isOpen: boolean;
  isLoading: boolean;
  onClick: () => void;
}

export function ChatBubble({ position, theme, isOpen, isLoading, onClick }: ChatBubbleProps) {
  const positionStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '20px',
    [position === 'bottom-right' ? 'right' : 'left']: '20px',
    zIndex: 9999,
  };

  const bg = theme === 'dark' ? '#1a1a2e' : '#4f46e5';

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      style={{
        ...positionStyle,
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: bg,
        color: '#fff',
        border: 'none',
        cursor: isLoading ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'transform 0.2s',
        transform: isOpen ? 'scale(0.9)' : 'scale(1)',
        fontSize: '24px',
        fontFamily: 'sans-serif',
      }}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
    >
      {isLoading ? '...' : isOpen ? '\u00D7' : '\u{1F4AC}'}
    </button>
  );
}
