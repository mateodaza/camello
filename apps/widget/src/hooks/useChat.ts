import { useState, useCallback } from 'react';

interface ChatMessage {
  role: 'customer' | 'artifact';
  content: string;
}

interface UseChatReturn {
  messages: ChatMessage[];
  conversationId: string | null;
  isSending: boolean;
  error: string | null;
  send: (text: string, conversationId?: string) => void;
}

/**
 * Send messages via the widget API and collect responses.
 *
 * MVP: synchronous request-response per message.
 * Future: SSE streaming for real-time token delivery.
 */
export function useChat(token: string, apiUrl: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string, existingConversationId?: string) => {
      if (isSending) return;
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

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const data = await res.json() as {
          conversation_id: string;
          response_text: string;
        };

        setConversationId(data.conversation_id);
        setMessages((prev) => [
          ...prev,
          { role: 'artifact', content: data.response_text },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        // Remove optimistic message on error
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsSending(false);
      }
    },
    [token, apiUrl, conversationId, isSending],
  );

  return { messages, conversationId, isSending, error, send };
}
