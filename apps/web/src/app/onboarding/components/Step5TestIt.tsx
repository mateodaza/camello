'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('Hi! What can you help me with?');
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
        <CardTitle>Try it out!</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Send a test message to see your AI agent in action. This is a live conversation.
        </p>

        {ensureCustomer.isError && (
          <p className="text-sm text-amber-600">
            Could not set up preview chat. You can test your agent from the dashboard after setup.
          </p>
        )}

        <div className="h-64 overflow-y-auto rounded-lg border bg-gray-50 p-3">
          {messages.length === 0 && (
            <p className="text-center text-xs text-gray-400">Send a message to get started</p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`mb-2 rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-gray-900 text-white'
                  : 'mr-8 bg-white border'
              }`}
            >
              {msg.text}
            </div>
          ))}
          {sendMessage.isPending && (
            <div className="mr-8 mb-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-400">
              Thinking...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            disabled={!customerId}
          />
          <Button type="submit" disabled={!input.trim() || !customerId || sendMessage.isPending}>
            Send
          </Button>
        </form>

        {sendMessage.isError && (
          <p className="text-sm text-red-600">{sendMessage.error.message}</p>
        )}

        <div className="border-t pt-4">
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            {complete.isPending ? 'Finishing...' : 'Go to Dashboard'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
