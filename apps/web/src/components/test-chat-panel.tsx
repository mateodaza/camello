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
}

export function TestChatPanel({ artifactId, artifactName, artifactType, open, onClose }: Props) {
  const t = useTranslations('artifacts');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ensureCustomer = trpc.onboarding.ensurePreviewCustomer.useMutation();
  const [customerId, setCustomerId] = useState<string | null>(null);

  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      if (!conversationId) setConversationId(data.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', text: data.responseText }]);
    },
  });

  // Ensure preview customer on first open
  useEffect(() => {
    if (open && !customerId) {
      ensureCustomer.mutate(undefined, {
        onSuccess: (data) => setCustomerId(data.customerId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset chat state when panel closes
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput('');
      setConversationId(null);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !customerId) return;

    const text = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');

    sendMessage.mutate({
      customerId,
      message: text,
      channel: 'webchat',
      sandbox: true,
      artifactId,
      ...(conversationId ? { conversationId } : {}),
    });
  };

  if (!open) return null;

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
            className="rounded-md p-1 text-dune hover:bg-sand hover:text-charcoal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="text-center">
              <p className="text-sm text-dune">{t('chatEmpty')}</p>
              <p className="mt-1 text-xs text-dune/70">
                {t(`testHint${artifactType.charAt(0).toUpperCase()}${artifactType.slice(1)}` as Parameters<typeof t>[0])}
              </p>
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

        {/* Input */}
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
      </div>
    </>
  );
}
