'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import type { Suggestion } from '../page';

interface Props {
  initialDescription?: string;
  onComplete: (suggestion: Suggestion, description: string) => void;
}

export function Step2BusinessModel({ initialDescription = '', onComplete }: Props) {
  const [description, setDescription] = useState(initialDescription);
  const parse = trpc.onboarding.parseBusinessModel.useMutation({
    onSuccess: (data, variables) => {
      // Use variables.description (the value sent to the server) instead of
      // the live `description` state — user may have edited the textarea
      // while the mutation was in flight.
      onComplete(data as Suggestion, variables.description);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.length >= 10) {
      parse.mutate({ description });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>What does your business do?</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">
            Describe your business in a few sentences. Our AI will suggest the best agent configuration for you.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., We're a digital marketing agency that helps small businesses grow their online presence through SEO, social media, and paid advertising..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            rows={4}
            minLength={10}
            maxLength={2000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{description.length}/2000</span>
            <Button type="submit" disabled={description.length < 10 || parse.isPending}>
              {parse.isPending ? 'Analyzing...' : 'Continue'}
            </Button>
          </div>
          {parse.isError && (
            <p className="text-sm text-red-600">Something went wrong. Please try again.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
