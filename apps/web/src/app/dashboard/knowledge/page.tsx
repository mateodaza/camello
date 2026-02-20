'use client';

import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { groupChunksByTitle, truncate, fmtDate } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Plus, Pencil } from 'lucide-react';

const sourceTypes = ['upload', 'url', 'api'] as const;

export default function KnowledgePage() {
  const utils = trpc.useUtils();

  // --- Knowledge filters & pagination ---
  const [filterSourceType, setFilterSourceType] = useState('');
  const [offset, setOffset] = useState(0);

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
        // Edit complete — close form, show the list
        setEditingTitle(null);
        setShowIngest(false);
        setIngestSuccess(null);
      } else {
        setIngestSuccess(data);
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
    },
  });

  const dismiss = trpc.learning.dismiss.useMutation({
    onSuccess: () => utils.learning.list.invalidate(),
  });

  const boost = trpc.learning.boost.useMutation({
    onSuccess: () => utils.learning.list.invalidate(),
  });

  const bulkClear = trpc.learning.bulkClearByModule.useMutation({
    onSuccess: () => utils.learning.list.invalidate(),
  });

  // --- Derived data ---
  const docs = useMemo(
    () => groupChunksByTitle(knowledgeList.data ?? []),
    [knowledgeList.data],
  );

  const learnings = useMemo(
    () =>
      (learningList.data ?? []).map((l) => ({
        ...l,
        contentShort: truncate(l.content, 80),
      })),
    [learningList.data],
  );

  // --- Primary query gate ---
  if (knowledgeList.isLoading) return <div className="text-gray-500">Loading...</div>;
  if (knowledgeList.isError) return <QueryError error={knowledgeList.error} />;

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
      <h1 className="text-2xl font-bold">Knowledge</h1>

      {/* Secondary error banners */}
      {learningList.isError && <QueryError error={learningList.error} />}

      {/* ===== SECTION 1: Knowledge Docs ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Documents</h2>
          <div className="flex items-center gap-3">
            <select
              value={filterSourceType}
              onChange={(e) => handleSourceTypeChange(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">All types</option>
              {sourceTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Button onClick={() => setShowIngest(!showIngest)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Knowledge
            </Button>
          </div>
        </div>

        {/* Ingest form */}
        {showIngest && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingTitle ? `Edit: ${editingTitle}` : 'Ingest Knowledge'}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleIngest} className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Content</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste knowledge text..."
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    rows={5}
                    required
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Return Policy"
                      className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
                    <select
                      value={sourceType}
                      onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
                      className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    >
                      {sourceTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {sourceType === 'url' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Source URL</label>
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://example.com/docs"
                      className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                      required
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={ingest.isPending || deleteByTitle.isPending}>
                    {ingest.isPending || deleteByTitle.isPending
                      ? (editingTitle ? 'Updating...' : 'Ingesting...')
                      : (editingTitle ? 'Update' : 'Ingest')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={editingTitle ? cancelEdit : () => setShowIngest(false)}>
                    Cancel
                  </Button>
                </div>
                {ingest.isError && (
                  <p className="text-sm text-red-600">{ingest.error.message}</p>
                )}
                {ingestSuccess && (
                  <p className="text-sm text-green-700">
                    Ingested {ingestSuccess.chunkCount} chunk{ingestSuccess.chunkCount !== 1 ? 's' : ''}
                    {ingestSuccess.title ? ` for "${ingestSuccess.title}"` : ''}.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Docs table */}
        {docs.length === 0 ? (
          <p className="text-gray-500">No knowledge docs yet.</p>
        ) : (
          <>
            <div className="rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Chunks</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.key} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{doc.title ?? '(untitled)'}</td>
                      <td className="px-4 py-3">
                        <Badge>{doc.sourceType}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{doc.chunkCount}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtDate(doc.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {doc.title ? (
                          deleteConfirm === doc.title ? (
                            <span className="flex items-center justify-end gap-2">
                              <span className="text-xs text-gray-500">
                                Delete all chunks with title &quot;{doc.title}&quot;? ({doc.chunkCount} loaded in current view)
                              </span>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteByTitle.mutate({ title: doc.title! })}
                                disabled={deleteByTitle.isPending}
                              >
                                {deleteByTitle.isPending ? 'Deleting...' : 'Confirm'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>
                                Cancel
                              </Button>
                            </span>
                          ) : (
                            <span className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(doc.title!)}>
                                <Pencil className="mr-1 h-3 w-3" />
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(doc.title)}>
                                Delete
                              </Button>
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400">untitled</span>
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
                  Previous
                </Button>
              )}
              {(knowledgeList.data?.length ?? 0) >= 50 && (
                <Button variant="outline" size="sm" onClick={() => setOffset(offset + 50)}>
                  Load more
                </Button>
              )}
              <span className="text-xs text-gray-400">
                Showing {offset + 1}–{offset + (knowledgeList.data?.length ?? 0)} chunks
              </span>
            </div>
          </>
        )}
      </div>

      {/* ===== SECTION 2: Learnings ===== */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Learnings</h2>
          <input
            type="text"
            value={filterModuleSlug}
            onChange={(e) => setFilterModuleSlug(e.target.value)}
            placeholder="Filter by module slug..."
            className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
          {filterModuleSlug.trim() && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkClear.mutate({ sourceModuleSlug: filterModuleSlug.trim() })}
              disabled={bulkClear.isPending || !filterModuleSlug.trim()}
            >
              {bulkClear.isPending ? 'Clearing...' : `Clear all "${filterModuleSlug.trim()}"`}
            </Button>
          )}
        </div>

        {learningList.isLoading ? (
          <div className="text-gray-500">Loading learnings...</div>
        ) : learnings.length === 0 ? (
          <p className="text-gray-500">No learnings yet.</p>
        ) : (
          <div className="rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Content</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Module</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {learnings.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Badge>{l.type}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-600" title={l.content}>
                      {l.contentShort}
                    </td>
                    <td className="px-4 py-3">{Number(l.confidence).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500">{l.sourceModuleSlug ?? '—'}</td>
                    <td className="px-4 py-3">
                      {l.archivedAt ? (
                        <Badge>archived</Badge>
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
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => boost.mutate({ learningId: l.id })}
                            disabled={boost.isPending}
                          >
                            Boost
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
