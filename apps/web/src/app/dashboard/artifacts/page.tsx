'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Bot, Plus } from 'lucide-react';

const artifactTypes = ['sales', 'support', 'marketing', 'custom'] as const;

export default function ArtifactsPage() {
  const utils = trpc.useUtils();
  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });
  const createArtifact = trpc.artifact.create.useMutation({
    onSuccess: () => {
      utils.artifact.list.invalidate();
      setShowCreate(false);
      setNewName('');
      setNewType('sales');
    },
  });
  const updateArtifact = trpc.artifact.update.useMutation({
    onSuccess: () => utils.artifact.list.invalidate(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<(typeof artifactTypes)[number]>('sales');

  if (artifacts.isLoading) return <div className="text-gray-500">Loading artifacts...</div>;
  if (artifacts.isError) return <QueryError error={artifacts.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Artifacts</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" />
          New Artifact
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <form
              className="flex items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                createArtifact.mutate({ name: newName.trim(), type: newType });
              }}
            >
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Sales Assistant"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  {artifactTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={createArtifact.isPending}>
                {createArtifact.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(artifacts.data?.length ?? 0) === 0 ? (
        <p className="text-gray-500">No artifacts yet. Create one to get started.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {artifacts.data?.map((a) => (
            <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-gray-400" />
                    <CardTitle className="text-base">{a.name}</CardTitle>
                  </div>
                  <Badge variant={a.type ?? 'default'}>{a.type}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    v{a.version} &middot; {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateArtifact.mutate({ id: a.id, isActive: !a.isActive })
                    }
                    disabled={updateArtifact.isPending}
                  >
                    {a.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
