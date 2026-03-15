'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { groupChunksByTitle } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, CheckCircle2, MoreHorizontal } from 'lucide-react';
import { KnowledgeGuidedEmptyState } from '@/components/dashboard/knowledge-guided-empty-state';
import { useToast } from '@/hooks/use-toast';

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  const tc = useTranslations('common');
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

  // --- Ingest form ---
  const [showIngest, setShowIngest] = useState(false);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [ingestArtifactId, setIngestArtifactId] = useState('');
  const [ingestSuccess, setIngestSuccess] = useState<{ chunkCount: number; title?: string } | null>(null);

  // --- Edit mode ---
  // Track (title, artifactId) together so edits preserve scope
  const [editingDoc, setEditingDoc] = useState<{ title: string; artifactId: string | null } | null>(null);

  // --- Delete ---
  // Track (title, artifactId) together to avoid cross-scope collisions
  const [deleteConfirm, setDeleteConfirm] = useState<{ title: string; artifactId: string | null } | null>(null);

  // --- View chunks ---
  const [viewChunksDoc, setViewChunksDoc] = useState<{ title: string; artifactId: string | null } | null>(null);

  // --- Teach input ---
  const [teachText, setTeachText] = useState('');
  const [teachError, setTeachError] = useState<string | null>(null);

  // --- Gap teach inline ---
  const [expandedGapIntent, setExpandedGapIntent] = useState<string | null>(null);
  const [gapAnswers, setGapAnswers] = useState<Record<string, string>>({});
  const [answeredGaps, setAnsweredGaps] = useState<Set<string>>(new Set());

  const [selectedArtifactId, setSelectedArtifactId] = useState('');

  const artifacts = trpc.artifact.list.useQuery({ activeOnly: false });
  const sufficiencyScore = trpc.knowledge.sufficiencyScore.useQuery();

  // Auto-select when exactly one agent exists (same pattern as analytics page)
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

  const editChunks = trpc.knowledge.getByTitle.useQuery(
    { title: editingDoc?.title ?? '', artifactId: editingDoc?.artifactId },
    { enabled: !!editingDoc },
  );

  const viewChunksData = trpc.knowledge.getByTitle.useQuery(
    { title: viewChunksDoc?.title ?? '', artifactId: viewChunksDoc?.artifactId },
    { enabled: !!viewChunksDoc },
  );

  // --- Mutations ---
  const ingest = trpc.knowledge.ingest.useMutation({
    onSuccess: (data) => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      setContent('');
      setTitle('');
      setIngestArtifactId('');
      if (editingDoc) {
        setEditingDoc(null);
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
      const title = variables.title ?? '';
      if (title.startsWith('Answer: ')) {
        const intent = title.slice('Answer: '.length);
        setAnsweredGaps((prev) => new Set(prev).add(intent));
      }
      setExpandedGapIntent(null);
      addToast(t('gapTeachSuccess'), 'success');
    },
  });

  const deleteByTitle = trpc.knowledge.deleteByTitle.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate();
      utils.knowledge.sufficiencyScore.invalidate();
      setDeleteConfirm(null);
      addToast(t('deletedToast'), 'success');
    },
  });

  // When edit chunks load, populate the form — restores scope (artifactId) from the card
  useEffect(() => {
    if (!editChunks.data || !editingDoc) return;
    const chunks = editChunks.data;
    if (chunks.length === 0) return;
    setContent(chunks.map((c) => c.content).join('\n\n'));
    setTitle(editingDoc.title);
    setIngestArtifactId(editingDoc.artifactId ?? '');
    setShowIngest(true);
  }, [editChunks.data, editingDoc]);

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
              <Skeleton className="h-4 w-12" />
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

    // Edit mode: delete old chunks first (scoped by artifactId to avoid cross-scope deletion), then re-ingest
    if (editingDoc) {
      await deleteByTitle.mutateAsync({ title: editingDoc.title, artifactId: editingDoc.artifactId });
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

  function handleEdit(docTitle: string, docArtifactId: string | null) {
    setEditingDoc({ title: docTitle, artifactId: docArtifactId });
    setDeleteConfirm(null);
    setIngestSuccess(null);
  }

  function cancelEdit() {
    setEditingDoc(null);
    setShowIngest(false);
    setContent('');
    setTitle('');
    setIngestArtifactId('');
  }

  return (
    <div className="space-y-8">
      {/* Page header with compact score */}
      <div className="space-y-0.5">
        <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>
        {sufficiencyScore.data && (
          <p className={`text-sm ${
            sufficiencyScore.data.score >= 80 ? 'text-teal' :
            sufficiencyScore.data.score >= 60 ? 'text-gold' :
            'text-sunset'
          }`}>
            {t('knowledgeScore')}: {sufficiencyScore.data.score}/100 —{' '}
            {sufficiencyScore.data.score >= 80
              ? t('knowledgeScoreExcellent')
              : sufficiencyScore.data.score >= 60
              ? t('knowledgeScoreGood')
              : t('knowledgeScoreNeedsWork')}
          </p>
        )}
      </div>

      {/* ===== Teach Input ===== */}
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

      {/* ===== SECTION 1: Knowledge Gaps ===== */}
      <div className="space-y-4" data-testid="knowledge-gaps-section">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionGaps')}</h2>
          {/* Agent selector — shown only when multiple agents exist */}
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
          /* Success empty state — only reached when query succeeded with zero results */
          <div data-testid="gaps-empty-state" className="flex items-center gap-2 rounded-lg bg-teal/8 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" />
            <p className="text-sm text-teal">{t('gapsEmptySuccess')}</p>
          </div>
        ) : (
          <ul data-testid="gaps-list" className="divide-y divide-charcoal/8 rounded-xl border-2 border-charcoal/8 bg-cream">
            {knowledgeGaps.data!.map((gap) => (
              <li
                key={gap.intent}
                className={`px-4 py-3 transition-opacity ${answeredGaps.has(gap.intent) ? 'opacity-50' : ''}`}
              >
                {/* Top row: intent badge + question + count + action button/badge */}
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
                {/* Inline teach form — shown only for the expanded gap */}
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

      {/* ===== SECTION 2: Knowledge Docs ===== */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionDocuments')}</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Scope toggle */}
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
            <Button onClick={() => setShowIngest(!showIngest)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('addKnowledge')}
            </Button>
          </div>
        </div>

        {/* Docs list */}
        {filteredDocs.length === 0 && !filterSearch ? (
          <KnowledgeGuidedEmptyState
            t={t}
            onAddType={(_type) => {
              setShowIngest(true);
            }}
          />
        ) : filteredDocs.length === 0 ? (
          <p className="py-6 text-center text-sm text-dune">{t('noSearchResults')}</p>
        ) : (
          <>
            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.key}
                  className="flex items-center justify-between rounded-xl border border-charcoal/8 bg-cream px-4 py-3"
                >
                  {/* Left: title + scope badge */}
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="truncate font-medium text-charcoal">
                      {doc.title ?? t('untitled')}
                    </span>
                    {doc.artifactId ? (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {artifacts.data?.find((a) => a.id === doc.artifactId)?.name
                          ?? doc.artifactId.slice(0, 8)}
                      </Badge>
                    ) : (
                      <span className="shrink-0 rounded-full bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal">
                        {t('scopeGlobalBadge')}
                      </span>
                    )}
                  </div>

                  {/* Right: delete confirm OR overflow menu */}
                  <div className="ml-4 shrink-0">
                    {doc.title && deleteConfirm?.title === doc.title && deleteConfirm?.artifactId === (doc.artifactId ?? null) ? (
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-dune">
                          {t('deleteConfirm', { title: doc.title })}
                        </span>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteByTitle.mutate({ title: doc.title!, artifactId: doc.artifactId ?? null })}
                          disabled={deleteByTitle.isPending}
                        >
                          {deleteByTitle.isPending ? t('deleting') : tc('confirm')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>
                          {tc('cancel')}
                        </Button>
                      </span>
                    ) : doc.title ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger aria-label={t('moreOptions')}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleEdit(doc.title!, doc.artifactId ?? null)}>
                            {tc('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteConfirm({ title: doc.title!, artifactId: doc.artifactId ?? null })}>
                            {tc('delete')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setViewChunksDoc({ title: doc.title!, artifactId: doc.artifactId ?? null })}>
                            {t('viewChunks')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-xs text-dune">{t('untitled')}</span>
                    )}
                  </div>
                </div>
              ))}
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

      {/* Ingest modal */}
      <Dialog
        open={showIngest}
        onClose={() => { editingDoc ? cancelEdit() : setShowIngest(false); }}
      >
        <DialogHeader>
          <DialogTitle>
            {editingDoc ? t('editTitle', { title: editingDoc.title }) : t('ingestKnowledge')}
          </DialogTitle>
        </DialogHeader>
        <DialogContent>
          <form onSubmit={handleIngest} className="space-y-3">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
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
                    className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                  >
                    <option value="">{t('assignToAllAgents')}</option>
                    {artifacts.data?.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={ingest.isPending || deleteByTitle.isPending}>
                {ingest.isPending || deleteByTitle.isPending
                  ? (editingDoc ? t('updating') : t('ingesting'))
                  : (editingDoc ? t('update') : t('ingest'))}
              </Button>
              <Button type="button" variant="ghost" onClick={editingDoc ? cancelEdit : () => setShowIngest(false)}>
                {tc('cancel')}
              </Button>
            </div>
            {ingest.isError && (
              <p className="text-sm text-error">{ingest.error.message}</p>
            )}
            {ingestSuccess && (
              <p className="text-sm text-teal">
                {t('ingestedMessage', { chunkCount: ingestSuccess.chunkCount, title: ingestSuccess.title ?? '' })}
              </p>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* View chunks modal */}
      <Dialog
        open={!!viewChunksDoc}
        onClose={() => setViewChunksDoc(null)}
      >
        <DialogHeader>
          <DialogTitle>
            {t('viewChunksDialogTitle', { title: viewChunksDoc?.title ?? '' })}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="max-h-[60vh] overflow-y-auto">
          {viewChunksData.isLoading && <Skeleton className="h-24 w-full" />}
          {viewChunksData.data && (
            <div className="space-y-3">
              {viewChunksData.data.map((chunk, i) => (
                <div
                  key={chunk.id}
                  className="rounded-md border border-charcoal/8 bg-sand p-3"
                >
                  <p className="mb-1 text-xs font-medium text-dune">
                    {t('chunkLabel', { n: i + 1 })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-charcoal">
                    {chunk.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
