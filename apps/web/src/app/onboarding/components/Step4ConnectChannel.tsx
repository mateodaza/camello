'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface Props {
  onComplete: () => void;
}

export function Step4ConnectChannel({ onComplete }: Props) {
  const [choice, setChoice] = useState<'webchat' | 'whatsapp' | null>(null);
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);
  const channelUpsert = trpc.channel.upsert.useMutation({
    onSuccess: () => onComplete(),
  });

  const widgetSnippet = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:5173'}/widget.js" async></script>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    if (phone.length >= 10) {
      channelUpsert.mutate({
        channelType: 'whatsapp',
        phoneNumber: phone,
        isActive: true,
      });
    }
  };

  if (!choice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connect a channel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600">
            Choose how your customers will talk to your AI agent. You can add more channels later.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setChoice('webchat')}
              className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-gray-400 hover:shadow-sm"
            >
              <p className="font-medium">WebChat Widget</p>
              <p className="mt-1 text-xs text-gray-500">Embed on your website. Ready in seconds.</p>
            </button>
            <button
              onClick={() => setChoice('whatsapp')}
              className="rounded-lg border border-gray-200 p-4 text-left transition hover:border-gray-400 hover:shadow-sm"
            >
              <p className="font-medium">WhatsApp</p>
              <p className="mt-1 text-xs text-gray-500">Connect via Meta Cloud API.</p>
            </button>
          </div>
          <div className="pt-2">
            <Button variant="ghost" onClick={onComplete}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (choice === 'webchat') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WebChat Widget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Copy this snippet and paste it before the closing <code>&lt;/body&gt;</code> tag on your website.
          </p>
          <div className="rounded bg-gray-900 p-3">
            <code className="text-xs text-green-400">{widgetSnippet}</code>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy Snippet'}
            </Button>
            <Button onClick={onComplete}>Continue</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Enter the phone number associated with your Meta Business account.
        </p>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
        />
        <p className="text-xs text-gray-400">
          Webhook URL: <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/channels/whatsapp/webhook</code>
        </p>
        <div className="flex gap-2">
          <Button onClick={handleWhatsApp} disabled={phone.length < 10 || channelUpsert.isPending}>
            {channelUpsert.isPending ? 'Saving...' : 'Save & Continue'}
          </Button>
          <Button variant="ghost" onClick={onComplete}>Skip</Button>
        </div>
        {channelUpsert.isError && (
          <p className="text-sm text-red-600">{channelUpsert.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
