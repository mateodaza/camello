import { useState, useCallback } from 'react';
import { t } from '../i18n/messages.js';

interface ChatMessage {
  role: 'customer' | 'artifact';
  content: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  conversationId: string | null;
  isSending: boolean;
  error: string | null;
  inputDisabled: boolean;
  send: (text: string, conversationId?: string) => void;
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

      // Optimistic: add user message immediately
      setMessages((prev) => [...prev, { role: 'customer', content: text }]);

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
          setMessages((prev) => prev.slice(0, -1));
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

        if (data.budget_exceeded) {
          setMessages((prev) => [...prev, { role: 'artifact', content: t('chat.error.budgetExceeded', language) }]);
          setInputDisabled(true);
        } else if (data.conversation_limit_reached) {
          setMessages((prev) => [...prev, { role: 'artifact', content: t('chat.error.conversationLimit', language) }]);
          setInputDisabled(true);
        } else if (data.daily_limit_reached) {
          setMessages((prev) => [...prev, { role: 'artifact', content: t('chat.error.dailyLimit', language) }]);
          setInputDisabled(true);
        } else {
          setMessages((prev) => [
            ...prev,
            { role: 'artifact', content: data.response_text },
          ]);
        }
      } catch {
        setError(t('chat.error.send', language));
        // Remove optimistic message on error
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsSending(false);
      }
    },
    [token, apiUrl, conversationId, isSending, language, inputDisabled],
  );

  return { messages, conversationId, isSending, error, inputDisabled, send };
}
