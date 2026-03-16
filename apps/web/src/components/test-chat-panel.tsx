'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { SimpleMarkdown } from '@/components/simple-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  artifactId: string;
  artifactName: string;
  artifactType: string;
  open: boolean;
  onClose: () => void;
  /** Pre-populate the message list (e.g. advisor opening message). */
  initialMessages?: ChatMessage[];
  /** Called whenever messages array or conversationId changes, so parent can track both. */
  onMessagesChange?: (messages: ChatMessage[], conversationId: string | null) => void;
  /** true → renders as flex column filling its container (no backdrop, no X button, no fixed positioning) */
  inline?: boolean;
  /** true → renders as fixed full-screen sheet (fixed inset-0) instead of right-drawer (fixed inset-y-0 right-0 max-w-md) */
  fullscreen?: boolean;
  /** when incremented, resets messages/input/conversationId */
  sessionKey?: number;
}

export function TestChatPanel({
  artifactId, artifactName, artifactType, open, onClose,
  initialMessages, onMessagesChange,
  inline, fullscreen, sessionKey,
}: Props) {
  const t = useTranslations('artifacts');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Generation counter: incremented on every session reset so in-flight
  // onSuccess callbacks from the previous session can detect they are stale
  // and discard their results rather than corrupting the fresh chat.
  const sessionGenRef = useRef(0);

  const ensureCustomer = trpc.onboarding.ensurePreviewCustomer.useMutation();
  const [customerId, setCustomerId] = useState<string | null>(null);

  // onSuccess is passed per-call in handleSend (not here) so that the
  // generation check can guard against stale replies from resets.
  const sendMessage = trpc.chat.send.useMutation();

  // Ensure preview customer on first open
  useEffect(() => {
    if (open && !customerId) {
      ensureCustomer.mutate(undefined, {
        onSuccess: (data) => setCustomerId(data.customerId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset chat state when panel closes.
  // Incrementing sessionGenRef invalidates any in-flight sendMessage.mutate calls
  // so their onSuccess callbacks discard stale replies rather than appending them
  // into the freshly cleared chat when the panel is reopened.
  useEffect(() => {
    if (!open) {
      sessionGenRef.current += 1;
      setMessages(initialMessages ?? []);
      setInput('');
      setConversationId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Session reset — triggered when sessionKey increments (0 = initial mount, skip).
  // Bumping sessionGenRef invalidates any in-flight sendMessage.mutate calls so
  // their onSuccess callbacks skip state updates rather than appending a stale
  // assistant reply into the freshly cleared chat.
  useEffect(() => {
    if (!sessionKey) return;
    sessionGenRef.current += 1;
    setMessages(initialMessages ?? []);
    setInput('');
    setConversationId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Notify parent whenever message list or conversationId changes
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;
  useEffect(() => {
    onMessagesChangeRef.current?.(messages, conversationId);
  }, [messages, conversationId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !customerId) return;

    const text = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');

    // Capture generation and conversationId at send time. The onSuccess guard
    // ensures a session reset between send and response discards the stale reply.
    const gen = sessionGenRef.current;
    const convIdAtSend = conversationId;
    sendMessage.mutate(
      {
        customerId,
        message: text,
        channel: 'webchat',
        sandbox: true,
        artifactId,
        ...(convIdAtSend ? { conversationId: convIdAtSend } : {}),
      },
      {
        onSuccess: (data) => {
          if (gen !== sessionGenRef.current) return; // session was reset — discard stale reply
          if (!convIdAtSend) setConversationId(data.conversationId);
          setMessages((prev) => [...prev, { role: 'assistant', text: data.responseText }]);
        },
      },
    );
  };

  if (!open && !inline) return null;

  // Shared inner content (messages list + input form)
  const messagesContent = (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 && (
        <div className="text-center">
          <p className="text-sm text-dune">{t('testChatEmpty')}</p>
        </div>
      )}
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`mb-2 rounded-lg px-3 py-2 text-sm ${
            msg.role === 'user'
              ? 'ml-8 bg-midnight text-cream'
              : 'mr-8 border border-charcoal/10 bg-sand'
          }`}
        >
          {msg.role === 'assistant' ? <SimpleMarkdown text={msg.text} /> : msg.text}
        </div>
      ))}
      {sendMessage.isPending && (
        <div className="mr-8 mb-2 rounded-lg border border-charcoal/10 bg-sand px-3 py-2 text-sm text-dune">
          {t('thinking')}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );

  const inputContent = (
    <div className="border-t border-charcoal/8 p-4">
      {sendMessage.isError && (
        <p className="mb-2 text-sm text-error">{sendMessage.error.message}</p>
      )}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('messagePlaceholder')}
          className="flex-1 rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
          disabled={!customerId}
        />
        <Button type="submit" disabled={!input.trim() || !customerId || sendMessage.isPending}>
          {t('sendButton')}
        </Button>
      </form>
    </div>
  );

  // Path 1 — inline (desktop right column)
  if (inline) {
    return (
      <div className="flex h-full flex-col bg-cream">
        <div className="flex items-center justify-between border-b border-charcoal/8 px-4 py-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">
            {t('testChatTitle')}
          </h2>
        </div>
        {messagesContent}
        {inputContent}
      </div>
    );
  }

  // Path 2 — fullscreen (mobile full-screen sheet)
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-cream shadow-xl">
        <div className="flex items-center justify-between border-b border-charcoal/8 px-4 py-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-charcoal">
              {t('testChat')} — {artifactName}
            </h2>
            <p className="text-xs text-dune">{t('testChatDescription')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-dune hover:bg-sand hover:text-charcoal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {messagesContent}
        {inputContent}
      </div>
    );
  }

  // Path 3 — default (right-drawer modal)
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-midnight/30" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-cream shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-charcoal/8 px-4 py-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-charcoal">
              {t('testChat')} — {artifactName}
            </h2>
            <p className="text-xs text-dune">{t('testChatDescription')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-dune hover:bg-sand hover:text-charcoal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {messagesContent}
        {inputContent}
      </div>
    </>
  );
}
