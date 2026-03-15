'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

const SENSITIVITY_HINT_MODULES = new Set(['send_quote', 'collect_payment']);

interface BoundModule {
  id: string;
  moduleId: string;
  slug: string;
  name: string;
  autonomyLevel: string;
  configOverrides: Record<string, unknown>;
}

interface ModuleLocalState {
  autonomyLevel: 'suggest_only' | 'draft_and_approve' | 'fully_autonomous';
  calendarUrl: string;
  paymentUrl: string;
  currency: string;
  validDays: number;
  slaMinutes: number;
}

interface ModuleSettingsProps {
  artifactId: string;
  boundModules: BoundModule[];
  onSaveSuccess?: () => void;
}

function initState(m: BoundModule): ModuleLocalState {
  const cfg = m.configOverrides as Record<string, unknown>;
  return {
    autonomyLevel: m.autonomyLevel === 'suggest_only'
      ? 'draft_and_approve'
      : ((m.autonomyLevel as ModuleLocalState['autonomyLevel']) ?? 'draft_and_approve'),
    calendarUrl: typeof cfg.calendarUrl === 'string' ? cfg.calendarUrl : '',
    paymentUrl: typeof cfg.paymentUrl === 'string' ? cfg.paymentUrl : '',
    currency: typeof cfg.currency === 'string' ? cfg.currency : 'USD',
    validDays: typeof cfg.validDays === 'number' ? cfg.validDays : 30,
    slaMinutes: typeof cfg.slaMinutes === 'number' ? cfg.slaMinutes : 60,
  };
}

export function ModuleSettings({ artifactId, boundModules, onSaveSuccess }: ModuleSettingsProps) {
  const t = useTranslations('agentWorkspace');
  const tt = useTranslations('tooltips');
  const { addToast } = useToast();
  const utils = trpc.useUtils();
  const attachModule = trpc.artifact.attachModule.useMutation();

  const [isOpen, setIsOpen] = useState(false);
  const [states, setStates] = useState<Record<string, ModuleLocalState>>(() =>
    Object.fromEntries(boundModules.map((m) => [m.moduleId, initState(m)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  if (boundModules.length === 0) return null;

  function updateState(moduleId: string, patch: Partial<ModuleLocalState>) {
    setStates((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId]!, ...patch },
    }));
  }

  function handleSave(m: BoundModule) {
    const s = states[m.moduleId];
    if (!s) return;

    const configOverrides: Record<string, unknown> = { ...m.configOverrides };
    if (m.slug === 'book_meeting') {
      configOverrides.calendarUrl = s.calendarUrl;
    } else if (m.slug === 'collect_payment') {
      configOverrides.paymentUrl = s.paymentUrl;
    } else if (m.slug === 'send_quote') {
      configOverrides.currency = s.currency;
      configOverrides.validDays = s.validDays;
    } else if (m.slug === 'escalate_to_human') {
      configOverrides.slaMinutes = s.slaMinutes;
    }

    setSavingId(m.moduleId);
    attachModule.mutate(
      { artifactId, moduleId: m.moduleId, autonomyLevel: s.autonomyLevel, configOverrides },
      {
        onSuccess: () => {
          utils.agent.workspace.invalidate({ artifactId });
          addToast(t('settingsSaved'), 'success');
          setSavingId(null);
          onSaveSuccess?.();
        },
        onError: () => {
          addToast(t('errorLoading'), 'error');
          setSavingId(null);
        },
      },
    );
  }

  function handleToggle(m: BoundModule, checked: boolean) {
    const s = states[m.moduleId];
    if (!s) return;

    const prevAutonomy = s.autonomyLevel;
    const newAutonomy = checked ? 'fully_autonomous' : 'draft_and_approve';
    updateState(m.moduleId, { autonomyLevel: newAutonomy });

    const configOverrides: Record<string, unknown> = { ...m.configOverrides };
    if (m.slug === 'book_meeting') {
      configOverrides.calendarUrl = s.calendarUrl;
    } else if (m.slug === 'collect_payment') {
      configOverrides.paymentUrl = s.paymentUrl;
    } else if (m.slug === 'send_quote') {
      configOverrides.currency = s.currency;
      configOverrides.validDays = s.validDays;
    } else if (m.slug === 'escalate_to_human') {
      configOverrides.slaMinutes = s.slaMinutes;
    }

    attachModule.mutate(
      { artifactId, moduleId: m.moduleId, autonomyLevel: newAutonomy, configOverrides },
      {
        onSuccess: () => {
          utils.agent.workspace.invalidate({ artifactId });
          addToast(t('settingsSaved'), 'success');
          onSaveSuccess?.();
        },
        onError: () => {
          updateState(m.moduleId, { autonomyLevel: prevAutonomy });
          addToast(t('errorLoading'), 'error');
        },
      },
    );
  }

  return (
    <div className="rounded-xl border border-charcoal/10 bg-cream">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={isOpen}
        aria-controls="module-settings-panel"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="text-sm font-semibold text-charcoal">{t('moduleSettings')}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-dune" />
        ) : (
          <ChevronRight className="h-4 w-4 text-dune" />
        )}
      </button>

      {isOpen && (
        <div id="module-settings-panel" className="divide-y divide-charcoal/5 border-t border-charcoal/10">
          {boundModules.map((m) => {
            const s = states[m.moduleId];
            if (!s) return null;

            return (
              <div key={m.moduleId} className="space-y-3 px-4 py-4">
                {/* Module name only */}
                <div className="flex items-center">
                  <span className="text-sm font-medium text-charcoal">{m.name}</span>
                </div>

                {/* Autonomy toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <label htmlFor={`toggle-${m.moduleId}`} className="text-sm text-charcoal">
                      {t('autoToggleLabel')}
                    </label>
                    <InfoTooltip label={tt('tooltipApprovalMode')} />
                  </div>
                  <input
                    id={`toggle-${m.moduleId}`}
                    type="checkbox"
                    role="switch"
                    checked={s.autonomyLevel === 'fully_autonomous'}
                    onChange={(e) => handleToggle(m, e.target.checked)}
                    disabled={savingId === m.moduleId}
                    className="h-5 w-9 cursor-pointer appearance-none rounded-full bg-charcoal/20 transition-colors checked:bg-teal disabled:opacity-50"
                    aria-label={t('autoToggleLabel')}
                  />
                </div>

                {/* Off-hint: shown when NOT fully_autonomous */}
                {s.autonomyLevel !== 'fully_autonomous' && (
                  <p className="text-xs text-dune">{t('autoToggleOffHint')}</p>
                )}

                {/* Sensitivity hint: send_quote + collect_payment only */}
                {SENSITIVITY_HINT_MODULES.has(m.slug) && (
                  <p className="text-xs text-gold">{t('sensitivityHint')}</p>
                )}

                {/* Slug-specific config fields */}
                {m.slug === 'book_meeting' && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`calUrl-${m.moduleId}`} className="text-xs font-medium text-dune">{t('calendarUrl')}</label>
                    <input
                      id={`calUrl-${m.moduleId}`}
                      type="url"
                      value={s.calendarUrl}
                      onChange={(e) => updateState(m.moduleId, { calendarUrl: e.target.value })}
                      placeholder="https://calendly.com/..."
                      className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                    />
                  </div>
                )}

                {m.slug === 'collect_payment' && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`payUrl-${m.moduleId}`} className="text-xs font-medium text-dune">{t('paymentUrl')}</label>
                    <input
                      id={`payUrl-${m.moduleId}`}
                      type="url"
                      value={s.paymentUrl}
                      onChange={(e) => updateState(m.moduleId, { paymentUrl: e.target.value })}
                      placeholder="https://buy.stripe.com/..."
                      className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                    />
                  </div>
                )}

                {m.slug === 'send_quote' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`currency-${m.moduleId}`} className="text-xs font-medium text-dune">
                        {t('defaultCurrency')}
                      </label>
                      <select
                        id={`currency-${m.moduleId}`}
                        value={s.currency}
                        onChange={(e) => updateState(m.moduleId, { currency: e.target.value })}
                        className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                      >
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="COP">COP</option>
                        <option value="MXN">MXN</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`validDays-${m.moduleId}`} className="text-xs font-medium text-dune">{t('validDays')}</label>
                      <input
                        id={`validDays-${m.moduleId}`}
                        type="number"
                        value={s.validDays}
                        min={1}
                        onChange={(e) =>
                          updateState(m.moduleId, { validDays: Number(e.target.value) })
                        }
                        className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                      />
                    </div>
                  </>
                )}

                {m.slug === 'escalate_to_human' && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`sla-${m.moduleId}`} className="text-xs font-medium text-dune">{t('slaMinutes')}</label>
                    <input
                      id={`sla-${m.moduleId}`}
                      type="number"
                      value={s.slaMinutes}
                      min={1}
                      onChange={(e) =>
                        updateState(m.moduleId, { slaMinutes: Number(e.target.value) })
                      }
                      className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                    />
                  </div>
                )}

                {/* Save button */}
                <button
                  type="button"
                  onClick={() => handleSave(m)}
                  disabled={savingId === m.moduleId}
                  className="min-h-9 rounded-md bg-teal px-4 text-xs font-medium text-white hover:bg-teal/90 disabled:opacity-50"
                >
                  {savingId === m.moduleId ? t('saving') : t('saveSettings')}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
