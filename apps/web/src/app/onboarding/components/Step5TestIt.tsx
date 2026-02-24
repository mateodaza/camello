'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface Props {
  previewCustomerId: string | null;
}

export function Step5TestIt({ previewCustomerId }: Props) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ensureCustomer = trpc.onboarding.ensurePreviewCustomer.useMutation();
  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: () => router.push('/dashboard'),
  });
  const sendMessage = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', text: data.responseText }]);
    },
  });

  const [customerId, setCustomerId] = useState(previewCustomerId);

  useEffect(() => {
    if (!customerId) {
      ensureCustomer.mutate(undefined, {
        onSuccess: (data) => setCustomerId(data.customerId),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('testItTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-charcoal">
          {t('testItDescription')}
        </p>

        {ensureCustomer.isError && (
          <p className="text-sm text-gold">
            {t('setupError')}
          </p>
        )}

        <div className="h-64 overflow-y-auto rounded-lg border border-charcoal/8 bg-sand p-3">
          {messages.length === 0 && (
            <p className="text-center text-xs text-dune">{t('chatEmpty')}</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-2 rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-midnight text-cream'
                  : 'mr-8 border border-charcoal/10 bg-cream'
              }`}
            >
              {msg.text}
            </div>
          ))}
          {sendMessage.isPending && (
            <div className="mr-8 mb-2 rounded-lg border border-charcoal/10 bg-cream px-3 py-2 text-sm text-dune">
              {t('thinking')}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

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

        {sendMessage.isError && (
          <p className="text-sm text-error">{sendMessage.error.message}</p>
        )}

        <div className="border-t border-charcoal/8 pt-4">
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            {complete.isPending ? t('finishing') : t('goToDashboard')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
