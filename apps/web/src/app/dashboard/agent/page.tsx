'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bot, MessageSquare, CheckCircle2, TrendingUp, BarChart2,
} from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { TestChatPanel } from '@/components/test-chat-panel';
import { ApprovalsSection } from '@/components/agent-workspace/sales/approvals-section';
import { AgentPerformance } from '@/components/agent-workspace/performance-panel';
import { TrustGraduationCard } from '@/components/agent-workspace/sales/trust-graduation-card';
import { QuotesSection } from '@/components/agent-workspace/sales/quotes-section';
import { MeetingsSection } from '@/components/agent-workspace/sales/meetings-section';
import { PaymentsSection } from '@/components/agent-workspace/sales/payments-section';
import { FollowupsSection } from '@/components/agent-workspace/sales/followups-section';
import { ModuleSettings } from '@/components/agent-workspace/module-settings';
import { WidgetAppearanceSection } from '@/components/agent-workspace/widget-appearance-section';
import { WorkspaceSectionErrorBoundary } from '@/components/agent-workspace/workspace-section-error-boundary';
import { AdvisorPanel } from '@/components/dashboard/advisor-panel';
import { Section } from '@/components/dashboard/section';
import { EmptyState } from '@/components/dashboard/empty-state';

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

export default function AgentsPage() {
  const t = useTranslations('agent');
  const ta = useTranslations('artifacts');
  const tt = useTranslations('tooltips');
  const te = useTranslations('emptyStates');
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  // Fetch the sales artifact (includes inactive — user may need to re-activate)
  const artifactList = trpc.artifact.list.useQuery({ type: 'sales', activeOnly: false });
  const artifact = artifactList.data?.[0] ?? null;
  const artifactId = artifact?.id ?? '';

  // Workspace data (metrics + bound modules)
  const workspace = trpc.agent.workspace.useQuery(
    { artifactId },
    { enabled: !!artifactId, retry: 2 },
  );

  // Uncapped pending + active lead counts (no limit: 50 cap)
  const dashboardOverview = trpc.agent.dashboardOverview.useQuery();

  // Pending executions list (capped at 50 for rendering; also drives auto-expand)
  const pendingExec = trpc.module.pendingExecutions.useQuery(
    { artifactId, limit: 50 },
    { enabled: !!artifactId },
  );

  // Sales activity counts — drives empty state for all 4 sub-sections
  const salesActivityCounts = trpc.agent.salesActivityCounts.useQuery(
    { artifactId },
    { enabled: !!artifactId },
  );

  // Tenant slug — needed for share link
  const tenant = trpc.tenant.me.useQuery();

  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [chatSessionKey, setChatSessionKey] = useState(0);

  // [AUDITOR FIX] SSR-safe: start with false (server doesn't have window).
  // The useEffect below sets the correct value after hydration.
  const [isDesktop, setIsDesktop] = useState(false);

  // isDesktop effect — mount detection + resize listener
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Ref for Modules section — used by TrustGraduationCard's onGoToModules callback
  const modulesRef = useRef<HTMLDetailsElement>(null);

  // Identity form state
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [greetingText, setGreetingText] = useState('');

  // Personality form state
  const [instructions, setInstructions] = useState('');
  const [tonePreset, setTonePreset] = useState('professional');
  const [toneCustom, setToneCustom] = useState('');

  // Sync form state when workspace data loads
  useEffect(() => {
    if (!workspace.data) return;
    const a = workspace.data.artifact;
    setName(a.name ?? '');
    setIsActive(a.isActive ?? false);
    const p = (a.personality as Record<string, unknown>) ?? {};
    setInstructions((p.instructions as string) ?? '');
    const rawG = p.greeting;
    setGreetingText(
      Array.isArray(rawG) ? (rawG as string[]).join('\n') : ((rawG as string) ?? ''),
    );
    const tone = (p.tone as string) ?? '';
    const preset = tone ? matchTonePreset(tone) : 'professional';
    setTonePreset(preset);
    setToneCustom(preset === 'other' ? tone : '');
  }, [workspace.data?.artifact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateArtifact = trpc.artifact.update.useMutation({
    onSuccess: () => {
      void utils.agent.workspace.invalidate({ artifactId });
      void utils.artifact.list.invalidate();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const setupArtifact = trpc.onboarding.setupArtifact.useMutation({
    onSuccess: () => {
      void utils.artifact.list.invalidate();
      addToast(ta('created'), 'success');
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  function handleConfigSaveSuccess() {
    setChatSessionKey((k) => k + 1);
    addToast(t('testChatReset'), 'success');
  }

  function handleIdentitySave() {
    const existing = (workspace.data?.artifact.personality as Record<string, unknown>) ?? {};
    const greetingLines = greetingText.split('\n').map((l) => l.trim()).filter(Boolean);
    const greetingValue =
      greetingLines.length <= 1 ? (greetingLines[0] ?? '') : greetingLines;
    updateArtifact.mutate(
      {
        id: artifactId,
        name: name.trim() || undefined,
        isActive,
        personality: { ...existing, greeting: greetingValue },
      },
      { onSuccess: () => { addToast(ta('activated'), 'success'); handleConfigSaveSuccess(); } },
    );
  }

  function handlePersonalitySave() {
    const existing = (workspace.data?.artifact.personality as Record<string, unknown>) ?? {};
    const finalTone =
      tonePreset === 'other'
        ? toneCustom.trim()
        : (TONE_PRESETS.find((p) => p.key === tonePreset)?.en ?? '');
    updateArtifact.mutate(
      { id: artifactId, personality: { ...existing, instructions, tone: finalTone } },
      { onSuccess: () => { addToast(ta('activated'), 'success'); handleConfigSaveSuccess(); } },
    );
  }

  // Pending count from dashboardOverview — uncapped (real SQL count(*), no limit: 50)
  const pendingCount = dashboardOverview.data?.pendingApprovalsCount ?? 0;
  const activeLeadsCount = dashboardOverview.data?.activeLeadsCount ?? 0;

  const inputClass =
    'w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal';
  const labelClass = 'mb-1 block text-xs font-medium text-charcoal';
  const saveBtnClass =
    'rounded-md bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50';

  // "First week" guard — empty state only shown for agents created < 7 days ago.
  // Fallback: if createdAt is absent, isFirstWeek = false → normal panel renders.
  const artifactCreatedAt = artifact?.createdAt;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const isFirstWeek = !!artifactCreatedAt &&
    (Date.now() - (artifactCreatedAt instanceof Date
      ? artifactCreatedAt.getTime()
      : new Date(artifactCreatedAt as string).getTime())) < msPerWeek;

  function handleCopyShareLink() {
    const slug = tenant.data?.slug;
    if (!slug) return;
    const url = `https://camello.xyz/chat/${slug}`;
    void navigator.clipboard.writeText(url).then(() => addToast(te('performanceCta'), 'success'));
  }

  if (artifactList.isLoading) {
    return (
      <div className="space-y-4 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (artifactList.isError) {
    return (
      <div className="p-6">
        <QueryError error={artifactList.error} onRetry={() => artifactList.refetch()} />
      </div>
    );
  }

  // Empty state — no sales artifact yet
  if (!artifact) {
    return (
      <div
        className="flex flex-col items-center justify-center p-12 text-center"
        data-testid="agent-empty-state"
      >
        <Bot className="mb-4 h-12 w-12 text-dune/50" />
        <h2 className="font-heading text-lg font-semibold text-charcoal">{t('agentEmpty')}</h2>
        <p className="mt-1 text-sm text-dune">
          Set up your AI sales agent to get started.
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-teal px-6 py-2 text-sm font-medium text-white hover:bg-teal/90 disabled:opacity-50"
          disabled={setupArtifact.isPending}
          onClick={() =>
            setupArtifact.mutate({
              name: 'Sales Agent',
              type: 'sales',
              personality: {},
              constraints: {},
              moduleIds: [],
            })
          }
        >
          {t('agentCreate')}
        </button>
      </div>
    );
  }

  const metrics = workspace.data?.metrics;
  const boundModules = workspace.data?.boundModules ?? [];

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-start">

        {/* LEFT COLUMN — scrollable config */}
        <div
          className={`min-w-0 flex-1 space-y-4 p-6 lg:overflow-y-auto lg:h-[calc(100vh-4rem)] ${!isDesktop ? 'pb-24' : ''}`}
        >
          {/* Agent Header */}
          <div
            data-testid="agent-header"
            className="flex flex-col gap-3 rounded-xl border border-charcoal/8 bg-cream px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-teal" />
                <h1
                  className="font-heading text-xl font-semibold text-charcoal"
                  data-testid="agent-name"
                >
                  {artifact.name}
                </h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    artifact.isActive ? 'bg-teal/10 text-teal' : 'bg-charcoal/10 text-dune'
                  }`}
                >
                  {artifact.isActive ? ta('on') : ta('off')}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-dune" data-testid="agent-type">
                {t('agentHeader')} · {ta('salesName')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-dune">
                {metrics && (
                  <>
                    <span>{metrics.conversationCount} conversations</span>
                    <span aria-hidden="true" className="text-charcoal/20">&middot;</span>
                    <span>{metrics.automationScore}% automation</span>
                    <span aria-hidden="true" className="text-charcoal/20">&middot;</span>
                  </>
                )}
                <span
                  data-testid="header-pending-count"
                  className={pendingCount > 0 ? 'font-medium text-teal' : ''}
                >
                  {pendingCount} pending
                </span>
                <span aria-hidden="true" className="text-charcoal/20">&middot;</span>
                <span>{activeLeadsCount} leads</span>
              </div>
            </div>
          </div>

          {/* Identity — expanded by default */}
          <Section
            title={t('agentIdentity')}
            defaultOpen={true}
            testId="section-identity"
          >
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
                  onClick={() => setIsActive((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 ${
                    isActive ? 'bg-teal' : 'bg-charcoal/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                      isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-charcoal">{isActive ? ta('on') : ta('off')}</span>
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
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleIdentitySave}
                disabled={updateArtifact.isPending}
                className={saveBtnClass}
              >
                Save
              </button>
            </div>
          </Section>

          {/* Personality — collapsed by default */}
          <Section
            title={t('agentPersonality')}
            defaultOpen={false}
            testId="section-personality"
          >
            <div className="space-y-3">
              <div>
                <label className={cn(labelClass, 'flex items-center gap-1')}>
                  {ta('instructions')}
                  <InfoTooltip label={tt('tooltipInstructions')} />
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={ta('instructionsPlaceholder')}
                  rows={4}
                  maxLength={2000}
                  className={inputClass}
                />
                <p className="mt-0.5 text-right text-xs text-dune">{instructions.length}/2000</p>
              </div>
              <div>
                <label className={cn(labelClass, 'flex items-center gap-1')}>
                  {ta('tone')}
                  <InfoTooltip label={tt('tooltipTone')} />
                </label>
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
                className={saveBtnClass}
              >
                Save
              </button>
            </div>
          </Section>

          {/* Modules & Autonomy — collapsed by default */}
          <Section
            title={t('agentModules')}
            defaultOpen={false}
            ref={modulesRef}
            testId="section-modules"
            tooltip={tt('tooltipSkills')}
          >
            {!!artifactId && (
              <WorkspaceSectionErrorBoundary key="module-settings">
                <ModuleSettings
                  artifactId={artifactId}
                  boundModules={boundModules.map((m) => ({
                    id: m.id,
                    moduleId: m.moduleId,
                    slug: m.slug,
                    name: m.name,
                    autonomyLevel: m.autonomyLevel,
                    configOverrides: (m.configOverrides ?? {}) as Record<string, unknown>,
                  }))}
                  onSaveSuccess={handleConfigSaveSuccess}
                />
              </WorkspaceSectionErrorBoundary>
            )}
          </Section>

          {/* Approvals — auto-expanded when pending > 0 */}
          <Section
            title={t('agentApprovals')}
            badge={pendingCount}
            defaultOpen={false}
            autoOpen={pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0}
            testId="section-approvals"
            tooltip={tt('tooltipApprovals')}
          >
            {!!artifactId && (
              pendingExec.isSuccess && (pendingExec.data?.length ?? 0) === 0 ? (
                <EmptyState
                  data-testid="approvals-empty-state"
                  icon={CheckCircle2}
                  title={te('approvalsTitle')}
                  description={te('approvalsDescription')}
                />
              ) : (
                <WorkspaceSectionErrorBoundary key="approvals">
                  <ApprovalsSection artifactId={artifactId} />
                </WorkspaceSectionErrorBoundary>
              )
            )}
          </Section>

          {/* Performance — collapsed by default */}
          <Section
            title={t('agentPerformance')}
            defaultOpen={false}
            testId="section-performance"
            tooltip={tt('tooltipPerformance')}
          >
            {!!artifactId && (
              workspace.isSuccess && isFirstWeek && (metrics?.conversationCount ?? 0) === 0 ? (
                <EmptyState
                  data-testid="performance-empty-state"
                  icon={TrendingUp}
                  title={te('performanceTitle')}
                  description={te('performanceDescription')}
                  action={{ label: te('performanceCta'), onClick: handleCopyShareLink }}
                />
              ) : (
                <>
                  <TrustGraduationCard
                    artifactId={artifactId}
                    boundModules={boundModules.map((m) => ({
                      moduleId: m.moduleId,
                      slug: m.slug,
                      name: m.name,
                      autonomyLevel: m.autonomyLevel,
                    }))}
                    onGoToModules={() => { if (modulesRef.current) modulesRef.current.open = true; }}
                  />
                  <div className="mt-4">
                    <AgentPerformance artifactId={artifactId} />
                  </div>
                </>
              )
            )}
          </Section>

          {/* Sales Activity — collapsed by default */}
          <Section
            title={t('agentSalesActivity')}
            defaultOpen={false}
            testId="section-sales-activity"
          >
            {!!artifactId && (
              salesActivityCounts.isSuccess && (salesActivityCounts.data?.total ?? 1) === 0 ? (
                <EmptyState
                  data-testid="sales-activity-empty-state"
                  icon={BarChart2}
                  title={te('salesActivityTitle')}
                  description={te('salesActivityDescription')}
                />
              ) : (
                <div className="space-y-4">
                  <WorkspaceSectionErrorBoundary key="quotes">
                    <QuotesSection artifactId={artifactId} />
                  </WorkspaceSectionErrorBoundary>
                  <WorkspaceSectionErrorBoundary key="meetings">
                    <MeetingsSection artifactId={artifactId} />
                  </WorkspaceSectionErrorBoundary>
                  <WorkspaceSectionErrorBoundary key="payments">
                    <PaymentsSection artifactId={artifactId} />
                  </WorkspaceSectionErrorBoundary>
                  <WorkspaceSectionErrorBoundary key="followups">
                    <FollowupsSection artifactId={artifactId} />
                  </WorkspaceSectionErrorBoundary>
                </div>
              )
            )}
          </Section>

          {/* Advanced — collapsed by default */}
          <Section
            title={t('agentAdvanced')}
            defaultOpen={false}
            testId="section-advanced"
          >
            {!!artifactId && (
              <>
                <div className="mb-4 pb-4 border-b border-charcoal/8">
                  <p className="flex items-center gap-1 text-xs font-medium text-charcoal">
                    {t('agentConstraints')}
                    <InfoTooltip label={tt('tooltipConstraints')} />
                  </p>
                  <p className="mt-0.5 text-xs text-dune">{t('agentConstraintsHint')}</p>
                </div>
                <WorkspaceSectionErrorBoundary key="widget-appearance">
                  <WidgetAppearanceSection
                    artifactId={artifactId}
                    initialConfig={(workspace.data?.artifact.config as Record<string, unknown>) ?? {}}
                    initialPersonality={
                      (workspace.data?.artifact.personality as Record<string, unknown>) ?? {}
                    }
                    onSaveSuccess={handleConfigSaveSuccess}
                  />
                </WorkspaceSectionErrorBoundary>
              </>
            )}
          </Section>

          {/* Advisor co-pilot panel — collapsed by default */}
          <AdvisorPanel />
        </div>

        {/* RIGHT COLUMN — inline test chat, desktop only (JS-conditional) */}
        {isDesktop && (
          <div
            className="lg:w-[35%] shrink-0 sticky top-0 h-[calc(100vh-4rem)]"
            data-testid="desktop-test-chat"
          >
            <TestChatPanel
              artifactId={artifactId}
              artifactName={artifact.name}
              artifactType={artifact.type}
              open={true}
              onClose={() => {}}
              inline={true}
              sessionKey={chatSessionKey}
            />
          </div>
        )}

      </div>

      {/* MOBILE STICKY BAR — bottom button, mobile only (JS-conditional) */}
      {!isDesktop && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex border-t border-charcoal/8 bg-cream p-3">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90"
            onClick={() => setMobileChatOpen(true)}
            data-testid="mobile-test-chat-btn"
          >
            <MessageSquare className="h-4 w-4" />
            {t('testChatMobileButton')}
          </button>
        </div>
      )}

      {/* MOBILE FULL-SCREEN SHEET — only rendered when mobileChatOpen */}
      {!isDesktop && (
        <TestChatPanel
          artifactId={artifactId}
          artifactName={artifact.name}
          artifactType={artifact.type}
          open={mobileChatOpen}
          onClose={() => setMobileChatOpen(false)}
          fullscreen={true}
          sessionKey={chatSessionKey}
        />
      )}
    </>
  );
}
