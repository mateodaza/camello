'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquare, BookOpen, Settings, LayoutDashboard } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceShell } from '@/components/agent-workspace/workspace-shell';
import { ModuleSettings } from '@/components/agent-workspace/module-settings';
import { WorkspaceSectionErrorBoundary } from '@/components/agent-workspace/workspace-section-error-boundary';
import { AgentSettingsPanel } from '@/components/agent-workspace/agent-settings-panel';
import { QuotesSection } from '@/components/agent-workspace/sales/quotes-section';
import { MeetingsSection } from '@/components/agent-workspace/sales/meetings-section';
import { PaymentsSection } from '@/components/agent-workspace/sales/payments-section';
import { FollowupsSection } from '@/components/agent-workspace/sales/followups-section';
import { AgentPerformance } from '@/components/agent-workspace/performance-panel';
import { AgentActivity } from '@/components/agent-workspace/agent-activity';
import { ApprovalsSection } from '@/components/agent-workspace/sales/approvals-section';

const TONE_PRESETS = [
  { key: 'professional', en: 'Professional, clear, and confident', es: 'Profesional, claro y seguro' },
  { key: 'friendly', en: 'Friendly, warm, and approachable', es: 'Amigable, cálido y accesible' },
  { key: 'casual', en: 'Casual, relaxed, and conversational', es: 'Casual, relajado y conversacional' },
  { key: 'formal', en: 'Formal, respectful, and precise', es: 'Formal, respetuoso y preciso' },
  { key: 'enthusiastic', en: 'Enthusiastic, casual, and engaging', es: 'Entusiasta, casual y atractivo' },
  { key: 'empathetic', en: 'Empathetic, patient, and thorough', es: 'Empático, paciente y minucioso' },
] as const;

function matchTonePreset(tone: string): string {
  const lower = tone.toLowerCase().trim();
  const match = TONE_PRESETS.find(
    (p) => p.en.toLowerCase() === lower || p.es.toLowerCase() === lower,
  );
  return match ? match.key : 'other';
}

export default function AgentConfigPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('agentWorkspace');
  const ta = useTranslations('artifacts');
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const workspace = trpc.agent.workspace.useQuery(
    { artifactId: id },
    { retry: 2 },
  );
  const knowledgeList = trpc.knowledge.list.useQuery({});

  const [activeTab, setActiveTab] = useState<'setup' | 'dashboard'>('setup');

  // --- Identity form state ---
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);

  // --- Personality form state ---
  const [instructions, setInstructions] = useState('');
  const [greetingText, setGreetingText] = useState('');
  const [tonePreset, setTonePreset] = useState('professional');
  const [toneCustom, setToneCustom] = useState('');

  // Sync form state from loaded data
  useEffect(() => {
    if (!workspace.data) return;
    const { artifact } = workspace.data;
    setName(artifact.name ?? '');
    setIsActive(artifact.isActive ?? false);
    const p = (artifact.personality as Record<string, unknown>) ?? {};
    setInstructions((p.instructions as string) ?? '');
    const rawG = p.greeting;
    setGreetingText(Array.isArray(rawG) ? (rawG as string[]).join('\n') : ((rawG as string) ?? ''));
    const tone = (p.tone as string) ?? '';
    const preset = tone ? matchTonePreset(tone) : 'professional';
    setTonePreset(preset);
    setToneCustom(preset === 'other' ? tone : '');
  }, [workspace.data?.artifact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateArtifact = trpc.artifact.update.useMutation({
    onSuccess: () => utils.agent.workspace.invalidate({ artifactId: id }),
    onError: (err) => addToast(err.message, 'error'),
  });

  function handleIdentitySave() {
    updateArtifact.mutate(
      { id, name: name.trim() || undefined, isActive },
      { onSuccess: () => addToast(t('configIdentitySaved'), 'success') },
    );
  }

  function handlePersonalitySave() {
    const existing = (workspace.data?.artifact.personality as Record<string, unknown>) ?? {};
    const finalTone =
      tonePreset === 'other'
        ? toneCustom.trim()
        : (TONE_PRESETS.find((p) => p.key === tonePreset)?.en ?? '');
    const greetingLines = greetingText.split('\n').map((l) => l.trim()).filter(Boolean);
    const greetingValue = greetingLines.length <= 1 ? (greetingLines[0] ?? '') : greetingLines;
    updateArtifact.mutate(
      {
        id,
        personality: { ...existing, instructions, greeting: greetingValue, tone: finalTone },
      },
      { onSuccess: () => addToast(t('configPersonalitySaved'), 'success') },
    );
  }

  if (workspace.isLoading) {
    return (
      <WorkspaceShell>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </WorkspaceShell>
    );
  }

  if (workspace.isError) {
    return (
      <WorkspaceShell>
        <QueryError error={workspace.error} onRetry={() => workspace.refetch()} />
      </WorkspaceShell>
    );
  }

  const { artifact, boundModules } = workspace.data!;
  const knowledgeCount = knowledgeList.data?.length ?? 0;
  const isCustom = artifact.type === 'custom';

  const sectionClass = 'rounded-xl border border-charcoal/8 bg-cream p-5';
  const labelClass = 'mb-1 block text-xs font-medium text-charcoal';
  const inputClass =
    'w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal';

  return (
    <WorkspaceShell>
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold text-charcoal">{artifact.name}</h1>
        <Link
          href={`/dashboard/conversations?artifactId=${id}`}
          className="flex items-center gap-1.5 rounded-md bg-teal/10 px-3 py-1.5 text-sm font-medium text-teal hover:bg-teal/20"
        >
          <MessageSquare className="h-4 w-4" />
          {t('configViewConversations')}
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-charcoal/5 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('setup')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'setup'
              ? 'bg-white text-charcoal shadow-sm'
              : 'text-dune hover:text-charcoal'
          }`}
        >
          <Settings className="h-4 w-4" />
          {t('tabSetup')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-white text-charcoal shadow-sm'
              : 'text-dune hover:text-charcoal'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          {t('tabDashboard')}
        </button>
      </div>

      {/* === Setup Tab === */}
      {activeTab === 'setup' && (
        <>
      {/* 1. Agent Identity */}
      <div className={sectionClass}>
        <h2 className="mb-4 font-heading text-base font-semibold text-charcoal">
          {t('configIdentityTitle')}
        </h2>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>{ta('agentName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={ta('agentNamePlaceholder')}
              maxLength={100}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 ${isActive ? 'bg-teal' : 'bg-charcoal/20'}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0'}`}
              />
            </button>
            <span className="text-sm text-charcoal">{isActive ? ta('on') : ta('off')}</span>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleIdentitySave}
            disabled={updateArtifact.isPending}
            className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
          >
            {t('configSave')}
          </button>
        </div>
      </div>

      {/* 2. Personality */}
      <div className={sectionClass}>
        <h2 className="mb-4 font-heading text-base font-semibold text-charcoal">
          {t('configPersonalityTitle')}
        </h2>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>{ta('instructions')}</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={isCustom ? ta('instructionsPlaceholderCustom') : ta('instructionsPlaceholder')}
              rows={4}
              maxLength={2000}
              className={inputClass}
            />
            <p className="mt-0.5 text-right text-xs text-dune">{instructions.length}/2000</p>
          </div>
          <div>
            <label className={labelClass}>{ta('greeting')}</label>
            <textarea
              value={greetingText}
              onChange={(e) => setGreetingText(e.target.value)}
              placeholder={ta('greetingPlaceholder')}
              rows={3}
              className={inputClass}
            />
            <p className="mt-0.5 text-xs text-dune">{ta('greetingHint')}</p>
          </div>
          <div>
            <label className={labelClass}>{ta('tone')}</label>
            <select
              value={tonePreset}
              onChange={(e) => setTonePreset(e.target.value)}
              className={inputClass}
            >
              {TONE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {ta(
                    `tone${p.key.charAt(0).toUpperCase()}${p.key.slice(1)}` as Parameters<
                      typeof ta
                    >[0],
                  )}
                </option>
              ))}
              <option value="other">{ta('toneOther')}</option>
            </select>
            {tonePreset === 'other' && (
              <input
                type="text"
                value={toneCustom}
                onChange={(e) => setToneCustom(e.target.value)}
                placeholder={ta('tonePlaceholder')}
                maxLength={100}
                className={`mt-1.5 ${inputClass}`}
              />
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handlePersonalitySave}
            disabled={updateArtifact.isPending}
            className="rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
          >
            {t('configSave')}
          </button>
        </div>
      </div>

      {/* 3. Modules */}
      <WorkspaceSectionErrorBoundary key="module-settings">
        <ModuleSettings
          artifactId={id}
          boundModules={boundModules.map((m) => ({
            id: m.id,
            moduleId: m.moduleId,
            slug: m.slug,
            name: m.name,
            autonomyLevel: m.autonomyLevel,
            configOverrides: (m.configOverrides ?? {}) as Record<string, unknown>,
          }))}
        />
      </WorkspaceSectionErrorBoundary>

      {/* 4. Knowledge */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-teal" />
            <h2 className="font-heading text-base font-semibold text-charcoal">
              {t('configKnowledgeTitle')}
            </h2>
          </div>
          <Link href="/dashboard/knowledge" className="text-sm text-teal hover:underline">
            {t('configManageKnowledge')}
          </Link>
        </div>
        <p className="mt-2 text-sm text-dune">
          {t('configKnowledgeDocs', { count: knowledgeCount })}
        </p>
      </div>

      {/* 5. Settings */}
      <WorkspaceSectionErrorBoundary key="settings-panel">
        <AgentSettingsPanel artifactId={id} />
      </WorkspaceSectionErrorBoundary>
        </>
      )}

      {/* === Dashboard Tab === */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <ApprovalsSection artifactId={id} />
          <AgentPerformance artifactId={id} />
          <QuotesSection artifactId={id} />
          <MeetingsSection artifactId={id} />
          <PaymentsSection artifactId={id} />
          <FollowupsSection artifactId={id} />
          <AgentActivity artifactId={id} />
        </div>
      )}
    </WorkspaceShell>
  );
}
