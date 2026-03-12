'use client';

import { useState, useMemo, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { groupChunksByTitle, truncate, fmtDate } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, BookOpen, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const sourceTypes = ['upload', 'url', 'api'] as const;

export default function KnowledgePage() {
  const t = useTranslations('knowledge');
  const tc = useTranslations('common');
  const locale = useLocale();
  const utils = trpc.useUtils();
  const { addToast } = useToast();

  // --- Knowledge filters & pagination ---
  const [filterSourceType, setFilterSourceType] = useState('');
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
  const [sourceType, setSourceType] = useState<(typeof sourceTypes)[number]>('upload');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ingestSuccess, setIngestSuccess] = useState<{ chunkCount: number; title?: string } | null>(null);

  // --- Edit mode ---
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  // --- Delete ---
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // --- Learning filters ---
  const [filterModuleSlug, setFilterModuleSlug] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Reset pagination + state on filter change
  function handleSourceTypeChange(val: string) {
    setFilterSourceType(val);
    setOffset(0);
    setDeleteConfirm(null);
    setIngestSuccess(null);
  }

  // --- Queries ---
  const knowledgeList = trpc.knowledge.list.useQuery({
    sourceType: filterSourceType || undefined,
    limit: 50,
    offset,
  });

  const learningList = trpc.learning.list.useQuery({
    sourceModuleSlug: filterModuleSlug.trim() || undefined,
    includeArchived,
    limit: 100,
  });

  // --- Mutations ---
  const ingest = trpc.knowledge.ingest.useMutation({
    onSuccess: (data) => {
      utils.knowledge.list.invalidate();
      setContent('');
      setTitle('');
      setSourceUrl('');
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
    setSourceType((chunks[0].sourceType as typeof sourceType) ?? 'upload');
    setShowIngest(true);
  }, [editChunks.data, editingTitle]);

  const deleteByTitle = trpc.knowledge.deleteByTitle.useMutation({
    onSuccess: () => {
      utils.knowledge.list.invalidate();
      setDeleteConfirm(null);
      addToast(t('deletedToast'), 'success');
    },
  });

  const dismiss = trpc.learning.dismiss.useMutation({
    onSuccess: () => {
      utils.learning.list.invalidate();
      addToast(t('dismissedToast'), 'success');
    },
  });

  const boost = trpc.learning.boost.useMutation({
    onSuccess: () => {
      utils.learning.list.invalidate();
      addToast(t('boostedToast'), 'success');
    },
  });

  const bulkClear = trpc.learning.bulkClearByModule.useMutation({
    onSuccess: () => {
      utils.learning.list.invalidate();
      addToast(t('clearedToast'), 'success');
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

  const learnings = useMemo(
    () =>
      (learningList.data ?? []).map((l) => ({
        ...l,
        contentShort: truncate(l.content, 80),
      })),
    [learningList.data],
  );

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

    // Edit mode: delete old chunks first, then re-ingest
    if (editingTitle) {
      await deleteByTitle.mutateAsync({ title: editingTitle });
    }

    ingest.mutate({
      content: content.trim(),
      title: title.trim() || undefined,
      sourceType,
      sourceUrl: sourceType === 'url' && sourceUrl.trim() ? sourceUrl.trim() : undefined,
    });
  }

  function handleEdit(docTitle: string) {
    setEditingTitle(docTitle);
    setDeleteConfirm(null);
    setIngestSuccess(null);
  }

  function cancelEdit() {
    setEditingTitle(null);
    setShowIngest(false);
    setContent('');
    setTitle('');
    setSourceUrl('');
  }

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      {/* Secondary error banners */}
      {learningList.isError && <QueryError error={learningList.error} onRetry={() => learningList.refetch()} />}

      {/* ===== SECTION 1: Knowledge Docs ===== */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionDocuments')}</h2>
          <div className="flex items-center gap-3">
            <select
              value={filterSourceType}
              onChange={(e) => handleSourceTypeChange(e.target.value)}
              className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">{t('filterAllTypes')}</option>
              {sourceTypes.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
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

        {/* Ingest form */}
        {showIngest && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingTitle ? t('editTitle', { title: editingTitle }) : t('ingestKnowledge')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
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
                  <div>
                    <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelType')}</label>
                    <select
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
                      className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    >
                      {sourceTypes.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {sourceType === 'url' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-charcoal">{t('labelSourceUrl')}</label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder={t('placeholderSourceUrl')}
                      className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                      required
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={ingest.isPending || deleteByTitle.isPending}>
                    {ingest.isPending || deleteByTitle.isPending
                      ? (editingTitle ? t('updating') : t('ingesting'))
                      : (editingTitle ? t('update') : t('ingest'))}
                  </Button>
                  <Button type="button" variant="ghost" onClick={editingTitle ? cancelEdit : () => setShowIngest(false)}>
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
            </CardContent>
          </Card>
        )}

        {/* Docs table */}
        {filteredDocs.length === 0 && !filterSearch ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <BookOpen className="h-12 w-12 text-dune/40" />
            <p className="font-heading text-lg font-semibold text-charcoal">{t('emptyDocsTitle')}</p>
            <p className="max-w-sm text-center text-sm text-dune">{t('emptyDocsDescription')}</p>
            <Button variant="outline" onClick={() => setShowIngest(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('emptyDocsAction')}
            </Button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <p className="py-6 text-center text-sm text-dune">{t('noSearchResults')}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
              <table className="min-w-[600px] w-full text-sm">
                <thead>
                  <tr className="border-b border-charcoal/8 text-left text-dune">
                    <th className="px-4 py-3 font-medium">{t('columnTitle')}</th>
                    <th className="px-4 py-3 font-medium">{t('columnType')}</th>
                    <th className="px-4 py-3 font-medium">{t('columnChunks')}</th>
                    <th className="px-4 py-3 font-medium">{t('columnCreated')}</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((doc) => (
                    <tr key={doc.key} className="border-b border-charcoal/8 last:border-0">
                      <td className="px-4 py-3 font-medium">{doc.title ?? t('untitled')}</td>
                      <td className="px-4 py-3">
                        <Badge>{doc.sourceType}</Badge>
                      </td>
                      <td className="px-4 py-3 text-dune">{doc.chunkCount}</td>
                      <td className="px-4 py-3 text-dune">{fmtDate(doc.createdAt, locale)}</td>
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
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>
                                {tc('cancel')}
                              </Button>
                            </span>
                          ) : (
                            <span className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(doc.title!)}>
                                <Pencil className="mr-1 h-3 w-3" />
                                {tc('edit')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(doc.title)}>
                                {tc('delete')}
                              </Button>
                            </span>
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

      {/* ===== SECTION 2: Learnings ===== */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-lg font-semibold text-charcoal">{t('sectionLearnings')}</h2>
          <input
            type="text"
            value={filterModuleSlug}
            onChange={(e) => setFilterModuleSlug(e.target.value)}
            placeholder={t('filterByModule')}
            className="rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <label className="flex items-center gap-2 text-sm text-charcoal">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            {t('showArchived')}
          </label>
          {filterModuleSlug.trim() && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkClear.mutate({ sourceModuleSlug: filterModuleSlug.trim() })}
              disabled={bulkClear.isPending || !filterModuleSlug.trim()}
            >
              {bulkClear.isPending ? t('clearing') : t('clearAll', { moduleSlug: filterModuleSlug.trim() })}
            </Button>
          )}
        </div>

        {learningList.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : learnings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Lightbulb className="h-12 w-12 text-dune/40" />
            <p className="font-heading text-lg font-semibold text-charcoal">{t('emptyLearningsTitle')}</p>
            <p className="max-w-sm text-center text-sm text-dune">{t('emptyLearningsDescription')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border-2 border-charcoal/8 bg-cream">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal/8 text-left text-dune">
                  <th className="px-4 py-3 font-medium">{t('columnType')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnContent')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnConfidence')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnModule')}</th>
                  <th className="px-4 py-3 font-medium">{t('columnStatus')}</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {learnings.map((l) => (
                  <tr key={l.id} className="border-b border-charcoal/8 last:border-0">
                    <td className="px-4 py-3">
                      <Badge>{l.type}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-charcoal" title={l.content}>
                      {l.contentShort}
                    </td>
                    <td className="px-4 py-3">{Number(l.confidence).toFixed(2)}</td>
                    <td className="px-4 py-3 text-dune">{l.sourceModuleSlug ?? '—'}</td>
                    <td className="px-4 py-3">
                      {l.archivedAt ? (
                        <Badge>{t('archived')}</Badge>
                      ) : (
                        <Badge variant="active">active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!l.archivedAt && (
                        <span className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => dismiss.mutate({ learningId: l.id })}
                            disabled={dismiss.isPending}
                          >
                            {t('dismiss')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => boost.mutate({ learningId: l.id })}
                            disabled={boost.isPending}
                          >
                            {t('boost')}
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
