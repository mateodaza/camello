import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../hooks/useChat.js';
import { t } from '../i18n/messages.js';
import { TypingIndicator } from './TypingIndicator.js';
import { MessageStatusIcon } from './MessageStatusIcon.js';
import { injectWidgetStyles } from '../utils/injectStyles.js';

interface ChatWindowProps {
  token: string;
  tenantName: string;
  artifactName: string;
  language: string;
  apiUrl: string;
  position: 'bottom-right' | 'bottom-left';
  theme: 'light' | 'dark';
  onClose: () => void;
}

export function ChatWindow({
  token,
  tenantName,
  artifactName,
  language,
  apiUrl,
  position,
  theme,
  onClose,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const { messages, conversationId, isSending, error, inputDisabled, send, retryMessage } = useChat(token, apiUrl, language);

  useEffect(() => { injectWidgetStyles(); }, []);

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
    setIsScrolledUp(!atBottom);
  }, []);

  useEffect(() => {
    if (!isScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, isScrolledUp]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending || inputDisabled) return;
    setInput('');
    send(text, conversationId ?? undefined);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsScrolledUp(false);
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
          aria-label={t('chat.close', language)}
        >
          {'\u00D7'}
        </button>
      </div>

      {/* Messages + scroll-to-bottom wrapper */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
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
              {t('chat.empty', language)}
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: '10px',
                display: 'flex',
                justifyContent: msg.role === 'customer' ? 'flex-end' : 'flex-start',
              }}
            >
              <div>
                <div
                  className="camello-msg-enter"
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
                {msg.role === 'customer' && (
                  <MessageStatusIcon
                    status={msg.metadata.status}
                    onRetry={() => retryMessage(msg.id)}
                    language={language}
                  />
                )}
              </div>
            </div>
          ))}
          {isSending && <TypingIndicator isDark={isDark} />}
          {error && (
            <div style={{ fontSize: '13px', color: '#e53e3e', marginTop: '4px', textAlign: 'center' }}>
              {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {isScrolledUp && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label={t('chat.scrollToBottom', language)}
            style={{
              position: 'absolute',
              bottom: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: '16px',
              padding: '6px 16px',
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '36px',
              zIndex: 1,
            }}
          >
            {t('chat.scrollToBottom', language)}
          </button>
        )}
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
          placeholder={t('chat.placeholder', language)}
          disabled={isSending || inputDisabled}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '8px',
            border: `1px solid ${isDark ? '#333' : '#d1d5db'}`,
            backgroundColor: inputBg,
            color: textColor,
            fontSize: '14px',
            outline: 'none',
            opacity: inputDisabled ? 0.5 : 1,
          }}
        />
        <button
          type="submit"
          disabled={isSending || inputDisabled || !input.trim()}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: '#4f46e5',
            color: '#fff',
            border: 'none',
            cursor: isSending ? 'wait' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
            opacity: isSending || inputDisabled || !input.trim() ? 0.5 : 1,
          }}
        >
          {t('chat.send', language)}
        </button>
      </form>
    </div>
  );
}
