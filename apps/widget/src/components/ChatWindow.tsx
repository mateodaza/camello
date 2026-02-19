import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat.js';

interface ChatWindowProps {
  token: string;
  tenantName: string;
  artifactName: string;
  apiUrl: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function ChatWindow({
  token,
  tenantName,
  artifactName,
  apiUrl,
  position,
  theme,
  onClose,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, conversationId, isSending, send } = useChat(token, apiUrl);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    send(text, conversationId ?? undefined);
  };

  const isDark = theme === 'dark';
  const bg = isDark ? '#1a1a2e' : '#ffffff';
  const headerBg = isDark ? '#16213e' : '#4f46e5';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const inputBg = isDark ? '#0f3460' : '#f3f4f6';

  const positionStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '88px',
    [position === 'bottom-right' ? 'right' : 'left']: '20px',
    zIndex: 9998,
  };

  return (
    <div
      style={{
        ...positionStyle,
        width: '380px',
        maxHeight: '520px',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: bg,
        color: textColor,
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: headerBg,
          color: '#fff',
          padding: '14px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{artifactName}</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>{tenantName}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0 4px',
          }}
          aria-label="Close chat"
        >
          {'\u00D7'}
        </button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          minHeight: '300px',
          maxHeight: '380px',
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', marginTop: '40px', fontSize: '14px' }}>
            Send a message to get started
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: '10px',
              display: 'flex',
              justifyContent: msg.role === 'customer' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%',
                padding: '8px 12px',
                borderRadius: '12px',
                fontSize: '14px',
                lineHeight: '1.4',
                backgroundColor:
                  msg.role === 'customer'
                    ? (isDark ? '#4f46e5' : '#4f46e5')
                    : (isDark ? '#0f3460' : '#f3f4f6'),
                color: msg.role === 'customer' ? '#fff' : textColor,
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div style={{ fontSize: '13px', color: '#999', marginTop: '4px' }}>
            Typing...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          padding: '10px 12px',
          borderTop: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isSending}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#333' : '#d1d5db'}`,
            backgroundColor: inputBg,
            color: textColor,
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            border: 'none',
            cursor: isSending ? 'wait' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            opacity: isSending || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
