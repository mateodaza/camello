'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Bot, Plus, MessageSquare, ChevronDown, ChevronUp, Zap, Trash2 } from 'lucide-react';
import { TestChatPanel } from '@/components/test-chat-panel';

const artifactTypes = ['sales', 'support', 'marketing', 'custom'] as const;

interface QuickAction {
  label: string;
  message: string;
}

export default function ArtifactsPage() {
  const t = useTranslations('artifacts');
  const tc = useTranslations('common');
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
  const [testingArtifact, setTestingArtifact] = useState<{ id: string; name: string } | null>(null);
  const [editingQA, setEditingQA] = useState<string | null>(null);
  const [qaEdits, setQaEdits] = useState<QuickAction[]>([]);

  if (artifacts.isLoading) return <div className="text-dune">{t('loading')}</div>;
  if (artifacts.isError) return <QueryError error={artifacts.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-charcoal">{t('pageTitle')}</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('newArtifact')}
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
                <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelName')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('placeholderName')}
                  className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelType')}</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                  className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  {artifactTypes.map((at) => (
                    <option key={at} value={at}>{at}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={createArtifact.isPending}>
                {createArtifact.isPending ? t('creating') : t('create')}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                {tc('cancel')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(artifacts.data?.length ?? 0) === 0 ? (
        <p className="text-dune">{t('noArtifacts')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {artifacts.data?.map((a) => {
            const personality = a.personality as Record<string, unknown> | null;
            const currentQA = (personality?.quickActions as QuickAction[]) ?? [];
            const isEditingThis = editingQA === a.id;

            return (
            <Card key={a.id} className={a.isActive ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-dune" />
                    <CardTitle className="text-base">{a.name}</CardTitle>
                  </div>
                  <Badge variant={a.type ?? 'default'}>{a.type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dune">
                    v{a.version} &middot; {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
                  </span>
                  <div className="flex gap-1">
                    {a.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTestingArtifact({ id: a.id, name: a.name })}
                      >
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        {t('test')}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateArtifact.mutate({ id: a.id, isActive: !a.isActive })
                      }
                      disabled={updateArtifact.isPending}
                    >
                      {a.isActive ? t('deactivate') : t('activate')}
                    </Button>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="border-t border-charcoal/10 pt-2">
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium text-charcoal"
                    onClick={() => {
                      if (isEditingThis) {
                        setEditingQA(null);
                      } else {
                        setEditingQA(a.id);
                        setQaEdits([...currentQA]);
                      }
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      {t('quickActions')} {currentQA.length > 0 && `(${currentQA.length})`}
                    </span>
                    {isEditingThis ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>

                  {isEditingThis && (
                    <div className="mt-2 space-y-2">
                      {qaEdits.map((qa, idx) => (
                        <div key={idx} className="flex gap-1.5">
                          <input
                            type="text"
                            value={qa.label}
                            onChange={(e) => {
                              const updated = [...qaEdits];
                              updated[idx] = { ...qa, label: e.target.value };
                              setQaEdits(updated);
                            }}
                            placeholder={t('quickActionLabel')}
                            maxLength={40}
                            className="w-28 rounded-md border border-charcoal/15 bg-cream px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
                          />
                          <input
                            type="text"
                            value={qa.message}
                            onChange={(e) => {
                              const updated = [...qaEdits];
                              updated[idx] = { ...qa, message: e.target.value };
                              setQaEdits(updated);
                            }}
                            placeholder={t('quickActionMessage')}
                            maxLength={200}
                            className="flex-1 rounded-md border border-charcoal/15 bg-cream px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-teal"
                          />
                          <button
                            onClick={() => setQaEdits(qaEdits.filter((_, i) => i !== idx))}
                            className="rounded p-1 text-dune hover:text-sunset"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {qaEdits.length < 4 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => setQaEdits([...qaEdits, { label: '', message: '' }])}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          {t('addQuickAction')}
                        </Button>
                      )}
                      {qaEdits.length >= 4 && (
                        <p className="text-xs text-dune">{t('maxQuickActions')}</p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="text-xs"
                          disabled={updateArtifact.isPending}
                          onClick={() => {
                            const filtered = qaEdits.filter((qa) => qa.label.trim() && qa.message.trim());
                            updateArtifact.mutate(
                              { id: a.id, personality: { ...personality, quickActions: filtered } },
                              { onSuccess: () => setEditingQA(null) },
                            );
                          }}
                        >
                          {updateArtifact.isPending ? tc('loading') : tc('save')}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditingQA(null)}>
                          {tc('cancel')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <TestChatPanel
        artifactId={testingArtifact?.id ?? ''}
        artifactName={testingArtifact?.name ?? ''}
        open={!!testingArtifact}
        onClose={() => setTestingArtifact(null)}
      />
    </div>
  );
}
