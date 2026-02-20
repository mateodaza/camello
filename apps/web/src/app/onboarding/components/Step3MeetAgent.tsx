'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface Suggestion {
  template: string;
  agentName: string;
  agentType: string;
  personality: { tone: string; greeting: string; goals: string[] };
  constraints: { neverDiscuss: string[]; alwaysEscalate: string[] };
  industry: string;
  confidence: number;
}

interface Props {
  suggestion: Suggestion;
  onComplete: () => void;
}

export function Step3MeetAgent({ suggestion, onComplete }: Props) {
  const [name, setName] = useState(suggestion.agentName);
  const [editing, setEditing] = useState(false);
  const modules = trpc.module.catalog.useQuery();

  const setup = trpc.onboarding.setupArtifact.useMutation({
    onSuccess: () => onComplete(),
  });

  const handleCreate = () => {
    setup.mutate({
      name,
      type: suggestion.agentType as 'sales' | 'support' | 'marketing' | 'custom',
      personality: suggestion.personality,
      constraints: suggestion.constraints,
      moduleIds: modules.data?.map((m: { id: string }) => m.id) ?? [],
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meet your AI agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-lg text-white">
              {name[0]?.toUpperCase()}
            </div>
            <div>
              {editing ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  autoFocus
                  onBlur={() => setEditing(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
                />
              ) : (
                <button onClick={() => setEditing(true)} className="text-left">
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-gray-500">Click to rename</p>
                </button>
              )}
            </div>
            <Badge className="ml-auto">{suggestion.agentType}</Badge>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700">Greeting</p>
          <p className="mt-1 text-sm text-gray-600">&ldquo;{suggestion.personality.greeting}&rdquo;</p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700">Goals</p>
          <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
            {suggestion.personality.goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700">Modules</p>
          {modules.isLoading && <p className="text-xs text-gray-400">Loading available modules...</p>}
          {modules.data && (
            <div className="mt-1 flex flex-wrap gap-1">
              {modules.data.map((m: { id: string; slug: string }) => (
                <Badge key={m.id} variant="outline">{m.slug}</Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleCreate} disabled={setup.isPending || !name.trim()}>
            {setup.isPending ? 'Creating...' : 'Looks Good'}
          </Button>
        </div>

        {setup.isError && (
          <p className="text-sm text-red-600">{setup.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
