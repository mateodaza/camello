import { useState, useCallback } from 'react';
import { t } from '../i18n/messages.js';

export interface ChatMessageMetadata {
  status: 'sent' | 'delivered' | 'error';
}

export interface ChatMessage {
  id: string;
  role: 'customer' | 'artifact';
  content: string;
  metadata: ChatMessageMetadata;
}

interface UseChatReturn {
  messages: ChatMessage[];
  conversationId: string | null;
  isSending: boolean;
  error: string | null;
  inputDisabled: boolean;
  send: (text: string, conversationId?: string) => void;
  retryMessage: (messageId: string) => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Send messages via the widget API and collect responses.
 *
 * MVP: synchronous request-response per message.
 * Future: SSE streaming for real-time token delivery.
 */
export function useChat(token: string, apiUrl: string, language: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputDisabled, setInputDisabled] = useState(false);

  const send = useCallback(
    async (text: string, existingConversationId?: string) => {
      if (isSending || inputDisabled) return;
      setIsSending(true);
      setError(null);

      const msgId = generateId();

      // Optimistic: add user message immediately with 'sent' status
      setMessages((prev) => [
        ...prev,
        { id: msgId, role: 'customer', content: text, metadata: { status: 'sent' } },
      ]);

      try {
        const res = await fetch(`${apiUrl}/api/widget/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            conversation_id: existingConversationId ?? conversationId,
          }),
        });

        if (res.status === 429) {
          setError(t('chat.error.rateLimit', language));
          // Rate limit: message never left — remove optimistic message
          setMessages((prev) => prev.filter((m) => m.id !== msgId));
          return;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as {
          conversation_id: string;
          response_text: string;
          budget_exceeded?: boolean;
          conversation_limit_reached?: boolean;
          daily_limit_reached?: boolean;
        };

        setConversationId(data.conversation_id);

        // Update customer message to delivered
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, metadata: { status: 'delivered' } } : m,
          ),
        );

        if (data.budget_exceeded) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'artifact',
              content: t('chat.error.budgetExceeded', language),
              metadata: { status: 'delivered' },
            },
          ]);
          setInputDisabled(true);
        } else if (data.conversation_limit_reached) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'artifact',
              content: t('chat.error.conversationLimit', language),
              metadata: { status: 'delivered' },
            },
          ]);
          setInputDisabled(true);
        } else if (data.daily_limit_reached) {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'artifact',
              content: t('chat.error.dailyLimit', language),
              metadata: { status: 'delivered' },
            },
          ]);
          setInputDisabled(true);
        } else {
          setMessages((prev) => [
            ...prev,
            { id: generateId(), role: 'artifact', content: data.response_text, metadata: { status: 'delivered' } },
          ]);
        }
      } catch {
        setError(t('chat.error.send', language));
        // Mark customer message as error — keep it visible
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, metadata: { status: 'error' } } : m,
          ),
        );
      } finally {
        setIsSending(false);
      }
    },
    [token, apiUrl, conversationId, isSending, language, inputDisabled],
  );

  const retryMessage = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) return;
      const content = msg.content;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      send(content, conversationId ?? undefined);
    },
    [messages, conversationId, send],
  );

  return { messages, conversationId, isSending, error, inputDisabled, send, retryMessage };
}
