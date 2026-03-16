'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { groupChunksByTitle } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Plus, MoreHorizontal, CheckCircle2 } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';
import { KnowledgeGuidedEmptyState } from '@/components/dashboard/knowledge-guided-empty-state';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useToast } from '@/hooks/use-toast';

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  const tc = useTranslations('common');
  const tt = useTranslations('tooltips');
  const te = useTranslations('emptyStates');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  // --- Knowledge filters & pagination ---
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'agent'>('all');
  const [filterScopeArtifactId, setFilterScopeArtifactId] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setFilterSearch(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Ingest dialog ---
  const [showIngest, setShowIngest] = useState(false);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [ingestArtifactId, setIngestArtifactId] = useState('');
  const [ingestSuccess, setIngestSuccess] = useState<{ chunkCount: number; title?: string } | null>(null);

  // --- Edit mode ---
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  // --- Delete ---
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // --- Teach input ---
  const [teachText, setTeachText] = useState('');
  const [teachError, setTeachError] = useState<string | null>(null);

  // --- Gap teach inline ---
  const [expandedGapIntent, setExpandedGapIntent] = useState<string | null>(null);
  const [gapAnswers, setGapAnswers] = useState<Record<string, string>>({});
  const [answeredGaps, setAnsweredGaps] = useState<Set<string>>(new Set());

  // --- Doc overflow menu ---
  const [expandedDocMenu, setExpandedDocMenu] = useState<string | null>(null);

  const [selectedArtifactId, setSelectedArtifactId] = useState('');

  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });
  const sufficiencyScore = trpc.knowledge.sufficiencyScore.useQuery();

  // Auto-select when exactly one agent exists
  useEffect(() => {
    if (selectedArtifactId === '' && artifacts.data?.length === 1) {
      setSelectedArtifactId(artifacts.data[0].id);
    }
  }, [artifacts.data, selectedArtifactId]);

  // Reset per-agent gap state when the selected agent changes
  useEffect(() => {
    setExpandedGapIntent(null);
    setGapAnswers({});
    setAnsweredGaps(new Set());
  }, [selectedArtifactId]);

  const knowledgeGaps = trpc.agent.supportKnowledgeGaps.useQuery(
    { artifactId: selectedArtifactId },
    { enabled: !!selectedArtifactId },
  );

  // --- Queries ---
  const knowledgeList = trpc.knowledge.list.useQuery({
    scope: filterScope,
    artifactId: filterScope === 'agent' ? (filterScopeArtifactId || undefined) : undefined,
    limit: 50,
    offset,
  });

  // --- Mutations ---
  const ingest = trpc.knowledge.ingest.useMutation({
    onSuccess: (data) => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      setContent('');
      setTitle('');
      setIngestArtifactId('');
      if (editingTitle) {
        setEditingTitle(null);
        setShowIngest(false);
        setIngestSuccess(null);
        addToast(t('updatedToast'), 'success');
      } else {
        setIngestSuccess(data);
        addToast(t('ingestedToast'), 'success');
      }
    },
  });

  const teachIngest = trpc.knowledge.ingest.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      setTeachText('');
      setTeachError(null);
      addToast(t('teachInputSuccess'), 'success');
    },
  });

  const gapTeachIngest = trpc.knowledge.ingest.useMutation({
    onSuccess: (_data, variables) => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      const ingestTitle = variables.title ?? '';
      if (ingestTitle.startsWith('Answer: ')) {
        const intent = ingestTitle.slice('Answer: '.length);
        setAnsweredGaps((prev) => new Set(prev).add(intent));
      }
      setExpandedGapIntent(null);
      addToast(t('gapTeachSuccess'), 'success');
    },
  });

  const editChunks = trpc.knowledge.getByTitle.useQuery(
    { title: editingTitle! },
    { enabled: !!editingTitle },
  );

  // When edit chunks load, populate the form
  useEffect(() => {
    if (!editChunks.data || !editingTitle) return;
    const chunks = editChunks.data;
    if (chunks.length === 0) return;
    setContent(chunks.map((c) => c.content).join('\n\n'));
    setTitle(editingTitle);
    setShowIngest(true);
  }, [editChunks.data, editingTitle]);

  const deleteByTitle = trpc.knowledge.deleteByTitle.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      setDeleteConfirm(null);
      setExpandedDocMenu(null);
      addToast(t('deletedToast'), 'success');
    },
  });

  // --- Derived data ---
  const docs = useMemo(
    () => groupChunksByTitle(knowledgeList.data ?? []),
    [knowledgeList.data],
  );

  const filteredDocs = filterSearch
    ? docs.filter((doc) => doc.title?.toLowerCase().includes(filterSearch.toLowerCase()))
    : docs;

  // --- Primary query gate ---
  if (knowledgeList.isLoading) return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <div className="flex gap-3">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="rounded-xl border-2 border-charcoal/8 bg-cream p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (knowledgeList.isError) return <QueryError error={knowledgeList.error} onRetry={() => knowledgeList.refetch()} />;

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setIngestSuccess(null);

    // Edit mode: delete old chunks first, then re-ingest
    if (editingTitle) {
      await deleteByTitle.mutateAsync({ title: editingTitle });
    }

    ingest.mutate({
      content: content.trim(),
      title: title.trim() || undefined,
      sourceType: 'upload',
      artifactId: ingestArtifactId || undefined,
    });
  }

  function handleTeachSubmit() {
    const text = teachText.trim();
    if (text.length < 20) {
      setTeachError(t('teachInputTooShort'));
      return;
    }
    setTeachError(null);
    teachIngest.mutate({
      content: text,
      title: `Manual entry — ${text.slice(0, 50)} [${Date.now()}]`,
      sourceType: 'upload',
    });
  }

  function handleGapTeach(intent: string) {
    setExpandedGapIntent((prev) => (prev === intent ? null : intent));
  }

  function handleGapSave(intent: string) {
    const text = (gapAnswers[intent] ?? '').trim();
    if (!text) return;
    gapTeachIngest.mutate({
      content: text,
      title: `Answer: ${intent}`,
      sourceType: 'upload',
    });
  }

  function handleEdit(docTitle: string) {
    setEditingTitle(docTitle);
    setDeleteConfirm(null);
    setExpandedDocMenu(null);
    setIngestSuccess(null);
  }

  function cancelEdit() {
    setEditingTitle(null);
    setShowIngest(false);
    setContent('');
    setTitle('');
    setIngestArtifactId('');
  }

  function openNewIngest() {
    cancelEdit();
    setShowIngest(true);
    setIngestSuccess(null);
  }

  // Score label
  const scoreData = sufficiencyScore.data;
  const scoreLabel = scoreData
    ? scoreData.score >= 80 ? t('knowledgeScoreExcellent')
    : scoreData.score >= 60 ? t('knowledgeScoreGood')
    : t('knowledgeScoreNeedsWork')
    : null;
  const scoreColor = scoreData
    ? scoreData.score >= 80 ? 'text-teal'
    : scoreData.score >= 60 ? 'text-gold'
    : 'text-sunset'
    : '';

  return (
    <div className="space-y-8">
      {/* Page header with inline score */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>
        {scoreData && (
          <span className="flex items-center gap-1 text-sm text-dune">
            {t('knowledgeScoreInline', { score: scoreData.score })}
            {' — '}
            <span className={`font-medium ${scoreColor}`}>{scoreLabel}</span>
            <InfoTooltip label={tt('tooltipKnowledgeScore')} />
          </span>
        )}
      </div>

      {/* Teach Input */}
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <textarea
            value={teachText}
            onChange={(e) => { setTeachText(e.target.value); setTeachError(null); }}
            placeholder={t('teachInputPlaceholder')}
            rows={3}
            className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <Button onClick={handleTeachSubmit} disabled={teachIngest.isPending}>
            {t('teachInputAdd')}
          </Button>
        </div>
        {teachError && <p className="text-sm text-sunset">{teachError}</p>}
      </div>

      {/* ===== SECTION 1: Knowledge Docs ===== */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionDocuments')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Scope toggle */}
            <div className="flex items-center gap-1">
              <div className="flex rounded-md border border-charcoal/15 bg-cream text-sm overflow-hidden">
                {(['all', 'global', 'agent'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setFilterScope(s); setOffset(0); setDeleteConfirm(null); setIngestSuccess(null); }}
                    className={`px-3 py-1.5 font-medium transition-colors ${filterScope === s ? 'bg-teal text-cream' : 'text-charcoal hover:bg-sand'}`}
                  >
                    {s === 'all' ? t('scopeAll') : s === 'global' ? t('scopeGlobal') : t('scopeAgent')}
                  </button>
                ))}
              </div>
              <InfoTooltip label={tt('tooltipKnowledgeScope')} />
            </div>
            {filterScope === 'agent' && (
              <select
                value={filterScopeArtifactId}
                onChange={(e) => { setFilterScopeArtifactId(e.target.value); setOffset(0); }}
                className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
              >
                <option value="">—</option>
                {artifacts.data?.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <input
              type="search"
              value={filterSearch}
              onChange={(e) => { setFilterSearch(e.target.value); setOffset(0); }}
              placeholder={t('searchKnowledge')}
              className="rounded-md border border-charcoal/20 bg-cream px-3 py-2 text-sm text-charcoal placeholder:text-dune focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <Button onClick={openNewIngest}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addKnowledge')}
            </Button>
          </div>
        </div>

        {/* Docs table — simplified: title + scope + overflow menu */}
        {filteredDocs.length === 0 && !filterSearch ? (
          <KnowledgeGuidedEmptyState
            t={t}
            onAddType={(_type) => openNewIngest()}
          />
        ) : filteredDocs.length === 0 ? (
          <p className="py-6 text-center text-sm text-dune">{t('noSearchResults')}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
              <table className="min-w-[400px] w-full text-sm">
                <thead>
                  <tr className="border-b border-charcoal/8 text-left text-dune">
                    <th className="px-4 py-3 font-medium">{t('columnTitle')}</th>
                    <th className="px-4 py-3 font-medium">{t('columnScope')}</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.key} className="border-b border-charcoal/8 last:border-0">
                      <td className="px-4 py-3 font-medium">{doc.title ?? t('untitled')}</td>
                      <td className="px-4 py-3">
                        {doc.artifactId ? (
                          <Badge variant="outline" className="text-xs">
                            {artifacts.data?.find((a) => a.id === doc.artifactId)?.name ?? doc.artifactId.slice(0, 8)}
                          </Badge>
                        ) : (
                          <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                            {t('scopeGlobalBadge')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {doc.title ? (
                          deleteConfirm === doc.title ? (
                            <span className="flex items-center justify-end gap-2">
                              <span className="text-xs text-dune">
                                {t('deleteConfirm', { title: doc.title })}
                              </span>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteByTitle.mutate({ title: doc.title! })}
                                disabled={deleteByTitle.isPending}
                              >
                                {deleteByTitle.isPending ? t('deleting') : tc('confirm')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDeleteConfirm(null); setExpandedDocMenu(null); }}>
                                {tc('cancel')}
                              </Button>
                            </span>
                          ) : expandedDocMenu === doc.title ? (
                            <span className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(doc.title!)}>
                                {tc('edit')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(doc.title)}>
                                {tc('delete')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setExpandedDocMenu(null)}>
                                {tc('cancel')}
                              </Button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setExpandedDocMenu(expandedDocMenu === doc.title ? null : doc.title)}
                              className="rounded-md p-1.5 text-dune hover:bg-sand hover:text-charcoal transition-colors"
                              aria-label={t('docActions')}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-dune">{t('untitled')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3">
              {offset > 0 && (
                <Button variant="outline" size="sm" onClick={() => setOffset(Math.max(0, offset - 50))}>
                  {t('previous')}
                </Button>
              )}
              {(knowledgeList.data?.length ?? 0) >= 50 && (
                <Button variant="outline" size="sm" onClick={() => setOffset(offset + 50)}>
                  {t('loadMore')}
                </Button>
              )}
              <span className="text-xs text-dune">
                {t('showingChunks', { start: offset + 1, end: offset + (knowledgeList.data?.length ?? 0) })}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ===== SECTION 2: Knowledge Gaps ===== */}
      <div className="space-y-4" data-testid="knowledge-gaps-section">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal flex items-center gap-1">
            {t('sectionGaps')}
            <InfoTooltip label={tt('tooltipUnansweredQuestions')} />
          </h2>
          {(artifacts.data?.length ?? 0) > 1 && (
            <select
              value={selectedArtifactId}
              onChange={(e) => setSelectedArtifactId(e.target.value)}
              className="ml-auto rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">—</option>
              {artifacts.data!.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {artifacts.isError ? (
          <QueryError error={artifacts.error} onRetry={() => artifacts.refetch()} />
        ) : !selectedArtifactId ? (
          <p className="text-sm text-dune">{t('gapsSelectAgent')}</p>
        ) : knowledgeGaps.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : knowledgeGaps.isError ? (
          <QueryError error={knowledgeGaps.error} onRetry={() => knowledgeGaps.refetch()} />
        ) : (knowledgeGaps.data?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-charcoal/8 bg-cream">
            <EmptyState
              data-testid="gaps-empty-state"
              icon={CheckCircle2}
              title={te('knowledgeGapsTitle')}
              description={te('knowledgeGapsDescription')}
            />
          </div>
        ) : (
          <ul data-testid="gaps-list" className="divide-y divide-charcoal/8 rounded-xl border-2 border-charcoal/8 bg-cream">
            {knowledgeGaps.data!.map((gap) => (
              <li
                key={gap.intent}
                className={`px-4 py-3 transition-opacity ${answeredGaps.has(gap.intent) ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className="inline-block rounded bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal lowercase shrink-0">
                    {gap.intent}
                  </span>
                  <div className="flex-1 min-w-0">
                    {gap.sampleQuestion && (
                      <p className="text-sm text-charcoal line-clamp-2">{gap.sampleQuestion}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-dune">{gap.count}×</span>
                  {answeredGaps.has(gap.intent) ? (
                    <span className="flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('gapAnswered')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGapTeach(gap.intent)}
                    >
                      {t('gapTeachButton')}
                    </Button>
                  )}
                </div>
                {expandedGapIntent === gap.intent && (
                  <div className="mt-2 space-y-2" data-testid={`gap-teach-form-${gap.intent}`}>
                    <textarea
                      value={gapAnswers[gap.intent] ?? ''}
                      onChange={(e) =>
                        setGapAnswers((prev) => ({ ...prev, [gap.intent]: e.target.value }))
                      }
                      placeholder={t('gapTeachPlaceholder', { intent: gap.intent })}
                      rows={3}
                      className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleGapSave(gap.intent)}
                        disabled={gapTeachIngest.isPending}
                      >
                        {t('gapTeachSave')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedGapIntent(null)}
                      >
                        {t('gapTeachCancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===== Ingest Dialog ===== */}
      <Dialog
        open={showIngest}
        onClose={editingTitle ? cancelEdit : () => setShowIngest(false)}
        className="max-w-lg"
        aria-labelledby="ingest-dialog-title"
      >
        <DialogHeader>
          <DialogTitle id="ingest-dialog-title">
            {editingTitle ? t('editTitle', { title: editingTitle }) : t('ingestKnowledge')}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form id="ingest-form" onSubmit={handleIngest} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelContent')}</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('placeholderContent')}
                className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                rows={5}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelTitle')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('placeholderTitle')}
                className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                maxLength={200}
              />
            </div>
            {(artifacts.data?.length ?? 0) > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelAssignTo')}</label>
                <select
                  value={ingestArtifactId}
                  onChange={(e) => setIngestArtifactId(e.target.value)}
                  className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  <option value="">{t('assignToAllAgents')}</option>
                  {artifacts.data?.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            {ingest.isError && (
              <p className="text-sm text-sunset">{ingest.error.message}</p>
            )}
            {ingestSuccess && (
              <p className="text-sm text-teal">
                {t('ingestedMessage', { chunkCount: ingestSuccess.chunkCount, title: ingestSuccess.title ?? '' })}
              </p>
            )}
          </form>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={editingTitle ? cancelEdit : () => setShowIngest(false)}>
            {tc('cancel')}
          </Button>
          <Button type="submit" form="ingest-form" disabled={ingest.isPending || deleteByTitle.isPending}>
            {ingest.isPending || deleteByTitle.isPending
              ? (editingTitle ? t('updating') : t('ingesting'))
              : (editingTitle ? t('update') : t('ingest'))}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
