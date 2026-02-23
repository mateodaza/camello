'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DollarSign, Headphones, Megaphone, Wrench,
  MessageSquare, Settings, X, Zap,
} from 'lucide-react';
import { TestChatPanel } from '@/components/test-chat-panel';
import { useToast } from '@/hooks/use-toast';
import type { LucideIcon } from 'lucide-react';

interface Archetype {
  type: 'sales' | 'support' | 'marketing' | 'custom';
  icon: LucideIcon;
  nameKey: string;
  descKey: string;
  defaultNameKey: string;
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
  { type: 'sales', icon: DollarSign, nameKey: 'salesName', descKey: 'salesDesc', defaultNameKey: 'salesDefaultName' },
  { type: 'support', icon: Headphones, nameKey: 'supportName', descKey: 'supportDesc', defaultNameKey: 'supportDefaultName' },
  { type: 'marketing', icon: Megaphone, nameKey: 'marketingName', descKey: 'marketingDesc', defaultNameKey: 'marketingDefaultName' },
  { type: 'custom', icon: Wrench, nameKey: 'customName', descKey: 'customDesc', defaultNameKey: 'customDefaultName' },
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
  const [greeting, setGreeting] = useState((p.greeting as string) ?? '');
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
    setGreeting((np.greeting as string) ?? '');
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
    updateArtifact.mutate(
      {
        id: artifact.id,
        name: name.trim() || undefined,
        personality: {
          ...existing,
          instructions,
          greeting,
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

          {/* Greeting */}
          <div>
            <label className="mb-1 block text-xs font-medium text-charcoal">{t('greeting')}</label>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder={t('greetingPlaceholder')}
              rows={2}
              className="w-full rounded-md border border-charcoal/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal"
            />
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

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-2xl font-bold text-charcoal">{t('pageTitle')}</h1>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ARCHETYPES.map((arch) => {
          const artifact = byType.get(arch.type);
          const isActive = artifact?.isActive ?? false;
          const Icon = arch.icon;

          return (
            <Card key={arch.type} className={isActive ? 'ring-2 ring-teal' : ''}>
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
                  <div className="flex items-center gap-2">
                    {artifact && <Badge variant={isActive ? 'active' : 'default'}>{isActive ? t('on') : t('off')}</Badge>}
                    <button
                      onClick={() => handleToggle(arch)}
                      disabled={createArtifact.isPending || updateArtifact.isPending}
                      className={`relative h-6 w-11 rounded-full transition-colors ${isActive ? 'bg-teal' : 'bg-charcoal/20'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-cream shadow transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                {/* Custom name input (when no artifact and toggling on) */}
                {arch.type === 'custom' && !artifact && showCustomInput && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder={t('customNamePlaceholder')}
                      maxLength={100}
                      className="flex-1 rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!customName.trim()) return;
                        createArtifact.mutate({ name: customName.trim(), type: 'custom' });
                        setCustomName('');
                        setShowCustomInput(false);
                      }}
                      disabled={createArtifact.isPending || !customName.trim()}
                    >
                      {t('create')}
                    </Button>
                  </div>
                )}

                {/* Action buttons */}
                {artifact && (
                  <div className="flex items-center gap-2 border-t border-charcoal/8 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPersonality(arch)}
                    >
                      <Settings className="mr-1 h-3.5 w-3.5" />
                      {t('personalitySection')}
                    </Button>
                    {isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTestingArtifact({ id: artifact.id, name: artifact.name, type: artifact.type })}
                      >
                        <MessageSquare className="mr-1 h-3.5 w-3.5" />
                        {t('test')}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
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
