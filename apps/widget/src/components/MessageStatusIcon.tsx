import React from 'react';
import { t } from '../i18n/messages.js';

interface MessageStatusIconProps {
  status: 'sent' | 'delivered' | 'error';
  onRetry: () => void;
  language: string;
}

export function MessageStatusIcon({ status, onRetry, language }: MessageStatusIconProps) {
  if (status === 'sent') {
    return (
      <div style={{ fontSize: '10px', color: '#fff', opacity: 0.7, marginTop: '2px', textAlign: 'right' }}>
        {'✓'}
      </div>
    );
  }

  if (status === 'delivered') {
    return (
      <div style={{ fontSize: '10px', color: '#93c5fd', marginTop: '2px', textAlign: 'right' }}>
        {'✓✓'}
      </div>
    );
  }

  // error
  return (
    <div style={{ marginTop: '4px', textAlign: 'right' }}>
      <button
        type="button"
        onClick={onRetry}
        aria-label={t('chat.retry', language)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#ef4444',
          fontSize: '10px',
          padding: '0',
          minHeight: '24px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
        }}
      >
        {'✗ ' + t('chat.retry', language)}
      </button>
    </div>
  );
}
