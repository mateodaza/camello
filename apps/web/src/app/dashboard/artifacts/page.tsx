'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign, Headphones, Megaphone, Wrench,
  MessageSquare, Settings, X, Zap, BarChart3,
} from 'lucide-react';
import { TestChatPanel } from '@/components/test-chat-panel';
import { useToast } from '@/hooks/use-toast';
import type { LucideIcon } from 'lucide-react';
import { sevenDaysAgoStr, localDateStr } from '@/lib/format';

interface Archetype {
  type: 'sales' | 'support' | 'marketing' | 'custom';
  icon: LucideIcon;
  nameKey: string;
  descKey: string;
  defaultNameKey: string;
  disabled?: boolean;
  comingSoonKey?: string;
}

const TONE_PRESETS = [
  { key: 'professional', en: 'Professional, clear, and business-like', es: 'Profesional, claro y ejecutivo' },
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

const ARCHETYPES: Archetype[] = [
  { type: 'sales',     icon: DollarSign, nameKey: 'salesName',     descKey: 'salesDesc',     defaultNameKey: 'salesDefaultName' },
  { type: 'support',   icon: Headphones, nameKey: 'supportName',   descKey: 'supportDesc',   defaultNameKey: 'supportDefaultName',   disabled: true, comingSoonKey: 'comingSoon' },
  { type: 'marketing', icon: Megaphone,  nameKey: 'marketingName', descKey: 'marketingDesc', defaultNameKey: 'marketingDefaultName', disabled: true, comingSoonKey: 'comingSoon' },
  { type: 'custom',    icon: Wrench,     nameKey: 'customName',    descKey: 'customDesc',    defaultNameKey: 'customDefaultName',    disabled: true, comingSoonKey: 'comingSoon' },
];

// ---------------------------------------------------------------------------
// Personality Drawer
// ---------------------------------------------------------------------------

interface DrawerArtifact {
  id: string;
  name: string;
  type: string;
  personality: Record<string, unknown>;
}

function PersonalityDrawer({
  artifact,
  archetype,
  open,
  onClose,
  onSaved,
}: {
  artifact: DrawerArtifact;
  archetype: Archetype;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('artifacts');
  const tc = useTranslations('common');
  const { addToast } = useToast();
  const utils = trpc.useUtils();

  const updateArtifact = trpc.artifact.update.useMutation({
    onSuccess: () => {
      utils.artifact.list.invalidate();
      onSaved();
    },
    onError: (err) => addToast(err.message, 'error'),
  });

  const p = artifact.personality ?? {};
  const [name, setName] = useState(artifact.name ?? '');
  const [instructions, setInstructions] = useState((p.instructions as string) ?? '');
  // Dynamic greetings: stored as string | string[]. UI: one greeting per line.
  const [greetingText, setGreetingText] = useState(() => {
    const raw = p.greeting;
    if (Array.isArray(raw)) return (raw as string[]).join('\n');
    return (raw as string) ?? '';
  });
  const initialTone = (p.tone as string) ?? '';
  const [tonePreset, setTonePreset] = useState(initialTone ? matchTonePreset(initialTone) : 'professional');
  const [toneCustom, setToneCustom] = useState(
    initialTone && matchTonePreset(initialTone) === 'other' ? initialTone : '',
  );

  const boundModules = trpc.artifact.listModules.useQuery(
    { artifactId: artifact.id },
    { enabled: open },
  );

  // Sync state when artifact changes (e.g. after save + refetch)
  useEffect(() => {
    if (!open) return;
    const np = artifact.personality ?? {};
    setName(artifact.name ?? '');
    setInstructions((np.instructions as string) ?? '');
    // Dynamic greetings: string | string[] → multiline text
    const rawG = np.greeting;
    setGreetingText(Array.isArray(rawG) ? (rawG as string[]).join('\n') : ((rawG as string) ?? ''));
    const existingTone = (np.tone as string) ?? '';
    const preset = existingTone ? matchTonePreset(existingTone) : 'professional';
    setTonePreset(preset);
    setToneCustom(preset === 'other' ? existingTone : '');
  }, [open, artifact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    const existing = artifact.personality ?? {};
    const finalTone = tonePreset === 'other'
      ? toneCustom.trim()
      : (TONE_PRESETS.find((p) => p.key === tonePreset)?.en ?? '');
    // Dynamic greetings: parse multiline → string | string[]
    const greetingLines = greetingText.split('\n').map((l) => l.trim()).filter(Boolean);
    const greetingValue = greetingLines.length <= 1
      ? (greetingLines[0] ?? '')   // single string (backward compat)
      : greetingLines;              // array for random selection

    updateArtifact.mutate(
      {
        id: artifact.id,
        name: name.trim() || undefined,
        personality: {
          ...existing,
          instructions,
          greeting: greetingValue,
          tone: finalTone,
        },
      },
      { onSuccess: () => addToast(tc('save'), 'success') },
    );
  }

  if (!open) return null;

  const isCustom = archetype.type === 'custom';
  const Icon = archetype.icon;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-midnight/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-cream shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-charcoal/8 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-teal" />
            <div>
              <h2 className="font-heading text-lg font-semibold text-charcoal">
                {t(archetype.nameKey as Parameters<typeof t>[0])}
              </h2>
              <p className="text-xs text-dune">{t('personalitySection')}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-dune hover:bg-sand hover:text-charcoal">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal">{t('agentName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('agentNamePlaceholder')}
              maxLength={100}
              className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>

          {/* Instructions */}
          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal">{t('instructions')}</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={isCustom ? t('instructionsPlaceholderCustom') : t('instructionsPlaceholder')}
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p className="mt-0.5 text-right text-xs text-dune">{instructions.length}/2000</p>
          </div>

          {/* Greeting (one per line = random rotation) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal">{t('greeting')}</label>
            <textarea
              value={greetingText}
              onChange={(e) => setGreetingText(e.target.value)}
              placeholder={t('greetingPlaceholder')}
              rows={3}
              className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p className="mt-0.5 text-xs text-dune">{t('greetingHint')}</p>
          </div>

          {/* Tone */}
          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal">{t('tone')}</label>
            <select
              value={tonePreset}
              onChange={(e) => setTonePreset(e.target.value)}
              className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            >
              {TONE_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {t(`tone${p.key.charAt(0).toUpperCase()}${p.key.slice(1)}` as Parameters<typeof t>[0])}
                </option>
              ))}
              <option value="other">{t('toneOther')}</option>
            </select>
            {tonePreset === 'other' && (
              <input
                type="text"
                value={toneCustom}
                onChange={(e) => setToneCustom(e.target.value)}
                placeholder={t('tonePlaceholder')}
                maxLength={100}
                className="mt-1.5 w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
              />
            )}
          </div>

          {/* Skills (read-only, derived from bound modules) */}
          <div className="border-t border-charcoal/8 pt-3">
            <div className="flex items-center gap-1.5 text-sm font-medium text-charcoal">
              <Zap className="h-3.5 w-3.5" />
              {t('skillsLabel')}
            </div>
            <p className="mt-0.5 text-xs text-dune">{t('skillsDescription')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {boundModules.isLoading && (
                <span className="text-xs text-dune">...</span>
              )}
              {boundModules.data && boundModules.data.length > 0 ? (
                boundModules.data.map((m) => (
                  <Badge key={m.moduleId} variant="default" className="text-xs">
                    {m.moduleName}
                  </Badge>
                ))
              ) : (
                !boundModules.isLoading && (
                  <span className="text-xs text-dune">{t('skillsEmpty')}</span>
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-charcoal/8 p-4">
          <Button
            className="w-full"
            disabled={updateArtifact.isPending}
            onClick={handleSave}
          >
            {updateArtifact.isPending ? tc('loading') : tc('save')}
          </Button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// DisabledCard — compact, no interactive controls
// ---------------------------------------------------------------------------

function DisabledCard({ arch }: { arch: Archetype }) {
  const t = useTranslations('artifacts');
  const Icon = arch.icon;
  return (
    <Card className="relative opacity-50 cursor-not-allowed">
      {arch.comingSoonKey && (
        <span className="absolute right-3 top-3 rounded-full bg-charcoal/10 px-2 py-0.5 text-xs font-medium text-charcoal/60">
          {t(arch.comingSoonKey as Parameters<typeof t>[0])}
        </span>
      )}
      <CardHeader className="pb-1">
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 text-teal" />
          <CardTitle className="text-base">
            {t(arch.nameKey as Parameters<typeof t>[0])}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-sm text-dune">{t(arch.descKey as Parameters<typeof t>[0])}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SalesHeroSection — full-width hero card for the sales archetype
// ---------------------------------------------------------------------------

function SalesHeroSection({
  arch,
  artifact,
  isActive,
  onToggle,
  onOpenPersonality,
  isPending,
}: {
  arch: Archetype;
  artifact: { id: string; name: string } | undefined;
  isActive: boolean;
  onToggle: () => void;
  onOpenPersonality: () => void;
  isPending: boolean;
}) {
  const t = useTranslations('artifacts');
  const Icon = arch.icon;

  const sevenDaysAgo = sevenDaysAgoStr();
  const today = localDateStr();
  const statsQuery = trpc.analytics.overview.useQuery(
    { from: sevenDaysAgo, to: today, artifactId: artifact?.id },
    { enabled: !!artifact },
  );
  const conversationTotal = (statsQuery.data?.conversations.active ?? 0)
    + (statsQuery.data?.conversations.resolved ?? 0)
    + (statsQuery.data?.conversations.escalated ?? 0);

  return (
    <div data-testid="sales-hero">
      <Card className="ring-2 ring-teal">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon className="h-5 w-5 text-teal" />
              <div>
                <CardTitle className="text-base">
                  {t(arch.nameKey as Parameters<typeof t>[0])}
                </CardTitle>
                {artifact?.name && (
                  <p className="text-sm font-medium text-charcoal/70">{artifact.name}</p>
                )}
                <p className="text-xs text-dune">{t(arch.descKey as Parameters<typeof t>[0])}</p>
              </div>
            </div>
            {/* Toggle — no Badge; active state appears in stat strip only */}
            <button
              onClick={onToggle}
              disabled={isPending}
              className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-teal' : 'bg-charcoal/20'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-cream shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {artifact && !statsQuery.isLoading && !statsQuery.isError && (
            <div
              data-testid="stat-strip"
              className="flex gap-4 text-sm text-dune py-2 border-t border-charcoal/8"
            >
              <span>
                <span>{t('salesCardConversationsThisWeek')}</span>
                {': '}
                <span className="font-medium text-charcoal">{conversationTotal}</span>
              </span>
              <span>
                <span>{t('salesCardActive')}</span>
                {': '}
                <span className="font-medium text-charcoal">
                  {isActive ? t('salesCardActiveYes') : t('salesCardActiveNo')}
                </span>
              </span>
            </div>
          )}
          {artifact && statsQuery.isLoading && (
            <div className="flex gap-4 py-2 border-t border-charcoal/8">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
            </div>
          )}
          {artifact && (
            <div className="flex flex-col gap-2 border-t border-charcoal/8 pt-2">
              <Button variant="ghost" size="sm" onClick={onOpenPersonality}>
                <Settings className="mr-1 h-3.5 w-3.5" />
                {t('personalitySection')}
              </Button>
              {isActive && (
                <Link
                  href={`/dashboard/agents/${artifact.id}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90"
                >
                  <BarChart3 className="h-4 w-4" />
                  {t('openWorkspace')}
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ArtifactsPage() {
  const t = useTranslations('artifacts');
  const utils = trpc.useUtils();
  const { addToast } = useToast();
  const artifactsQuery = trpc.artifact.list.useQuery({ activeOnly: false });

  const createArtifact = trpc.artifact.create.useMutation({
    onSuccess: () => {
      utils.artifact.list.invalidate();
      addToast(t('created'), 'success');
    },
    onError: (err) => addToast(err.message, 'error'),
  });
  const updateArtifact = trpc.artifact.update.useMutation({
    onSuccess: () => utils.artifact.list.invalidate(),
    onError: (err) => addToast(err.message, 'error'),
  });

  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [testingArtifact, setTestingArtifact] = useState<{ id: string; name: string; type: string } | null>(null);
  const [editingArtifact, setEditingArtifact] = useState<{ artifact: DrawerArtifact; archetype: Archetype } | null>(null);

  if (artifactsQuery.isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-36" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
  if (artifactsQuery.isError) return <QueryError error={artifactsQuery.error} onRetry={() => artifactsQuery.refetch()} />;

  // Build map + track duplicates
  const byType = new Map<string, NonNullable<typeof artifactsQuery.data>[number]>();
  const duplicates: Array<{ type: string; extraIds: string[] }> = [];

  const sorted = [...(artifactsQuery.data ?? [])].sort((x, y) => {
    if (x.isActive !== y.isActive) return x.isActive ? -1 : 1;
    return new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime();
  });
  for (const a of sorted) {
    if (byType.has(a.type)) {
      const existing = duplicates.find((d) => d.type === a.type);
      if (existing) existing.extraIds.push(a.id);
      else duplicates.push({ type: a.type, extraIds: [a.id] });
      continue;
    }
    byType.set(a.type, a);
  }

  function handleToggle(arch: Archetype) {
    if (arch.disabled) return;   // defense-in-depth: unreachable if button disabled prop works
    const artifact = byType.get(arch.type);
    if (!artifact) {
      if (arch.type === 'custom' && !customName.trim()) {
        setShowCustomInput(true);
        return;
      }
      const name = arch.type === 'custom' ? customName.trim() : t(arch.defaultNameKey as Parameters<typeof t>[0]);
      createArtifact.mutate({ name, type: arch.type });
      setCustomName('');
      setShowCustomInput(false);
    } else if (artifact.isActive) {
      updateArtifact.mutate({ id: artifact.id, isActive: false });
      addToast(t('deactivated'), 'success');
    } else {
      updateArtifact.mutate({ id: artifact.id, isActive: true });
      addToast(t('activated'), 'success');
    }
  }

  function openPersonality(arch: Archetype) {
    const artifact = byType.get(arch.type);
    if (!artifact) return;
    setEditingArtifact({
      artifact: {
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        personality: (artifact.personality as Record<string, unknown>) ?? {},
      },
      archetype: arch,
    });
  }

  const salesArch = ARCHETYPES.find((a) => a.type === 'sales')!;
  const salesArtifact = byType.get('sales');
  const salesIsActive = salesArtifact?.isActive ?? false;
  const disabledArchetypes = ARCHETYPES.filter((a) => a.disabled);

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-bold text-charcoal md:text-2xl">{t('pageTitle')}</h1>

      {duplicates.length > 0 && (
        <Card className="border-gold/25 bg-gold/10">
          <CardContent className="py-3">
            <p className="text-sm font-medium text-charcoal">{t('duplicateWarning')}</p>
            <p className="mt-1 text-xs text-dune">
              {duplicates.map((d) => `${d.type}: ${d.extraIds.join(', ')}`).join(' · ')}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Sales hero — full width, outside and above the disabled grid */}
      <SalesHeroSection
        arch={salesArch}
        artifact={salesArtifact}
        isActive={salesIsActive}
        onToggle={() => handleToggle(salesArch)}
        onOpenPersonality={() => openPersonality(salesArch)}
        isPending={createArtifact.isPending || updateArtifact.isPending}
      />

      {/* 3 disabled cards — compact 3-col row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="disabled-grid">
        {disabledArchetypes.map((arch) => (
          <DisabledCard key={arch.type} arch={arch} />
        ))}
      </div>

      {/* Personality Drawer */}
      {editingArtifact && (
        <PersonalityDrawer
          artifact={editingArtifact.artifact}
          archetype={editingArtifact.archetype}
          open={!!editingArtifact}
          onClose={() => setEditingArtifact(null)}
          onSaved={() => setEditingArtifact(null)}
        />
      )}

      <TestChatPanel
        artifactId={testingArtifact?.id ?? ''}
        artifactName={testingArtifact?.name ?? ''}
        artifactType={testingArtifact?.type ?? 'custom'}
        open={!!testingArtifact}
        onClose={() => setTestingArtifact(null)}
      />
    </div>
  );
}
