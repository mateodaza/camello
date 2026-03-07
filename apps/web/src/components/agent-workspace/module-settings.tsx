'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';

const MODULE_RISK_TIER: Record<string, 'low' | 'medium' | 'high'> = {
  qualify_lead: 'low',
  book_meeting: 'medium',
  send_followup: 'medium',
  capture_interest: 'low',
  draft_content: 'low',
  send_quote: 'high',
  collect_payment: 'high',
  create_ticket: 'low',
  escalate_to_human: 'medium',
};

const RISK_TIER_CLASS: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-teal/10 text-teal',
  medium: 'bg-gold/10 text-gold',
  high: 'bg-sunset/10 text-sunset',
};

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
}

function initState(m: BoundModule): ModuleLocalState {
  const cfg = m.configOverrides as Record<string, unknown>;
  return {
    autonomyLevel: (m.autonomyLevel as ModuleLocalState['autonomyLevel']) ?? 'draft_and_approve',
    calendarUrl: typeof cfg.calendarUrl === 'string' ? cfg.calendarUrl : '',
    paymentUrl: typeof cfg.paymentUrl === 'string' ? cfg.paymentUrl : '',
    currency: typeof cfg.currency === 'string' ? cfg.currency : 'USD',
    validDays: typeof cfg.validDays === 'number' ? cfg.validDays : 30,
    slaMinutes: typeof cfg.slaMinutes === 'number' ? cfg.slaMinutes : 60,
  };
}

export function ModuleSettings({ artifactId, boundModules }: ModuleSettingsProps) {
  const t = useTranslations('agentWorkspace');
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
        },
        onError: () => {
          addToast(t('errorLoading'), 'error');
          setSavingId(null);
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
        <div className="divide-y divide-charcoal/5 border-t border-charcoal/10">
          {boundModules.map((m) => {
            const s = states[m.moduleId];
            if (!s) return null;
            const tier = MODULE_RISK_TIER[m.slug] ?? 'low';
            const tierLabel =
              tier === 'low'
                ? t('riskTierLow')
                : tier === 'medium'
                  ? t('riskTierMedium')
                  : t('riskTierHigh');

            return (
              <div key={m.moduleId} className="space-y-3 px-4 py-4">
                {/* Module name + risk badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-charcoal">{m.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_TIER_CLASS[tier]}`}
                  >
                    {tierLabel}
                  </span>
                </div>

                {/* Autonomy level */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-dune">{t('autonomyLevel')}</label>
                  <select
                    value={s.autonomyLevel}
                    onChange={(e) =>
                      updateState(m.moduleId, {
                        autonomyLevel: e.target.value as ModuleLocalState['autonomyLevel'],
                      })
                    }
                    className="rounded-md border border-charcoal/20 bg-white px-2 py-1.5 text-xs text-charcoal"
                  >
                    <option value="fully_autonomous">{t('autonomyFullyAutonomous')}</option>
                    <option value="draft_and_approve">{t('autonomyDraftAndApprove')}</option>
                    <option value="suggest_only">{t('autonomySuggestOnly')}</option>
                  </select>
                </div>

                {/* Slug-specific config fields */}
                {m.slug === 'book_meeting' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-dune">{t('calendarUrl')}</label>
                    <input
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
                    <label className="text-xs font-medium text-dune">{t('paymentUrl')}</label>
                    <input
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
                      <label className="text-xs font-medium text-dune">
                        {t('defaultCurrency')}
                      </label>
                      <select
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
                      <label className="text-xs font-medium text-dune">{t('validDays')}</label>
                      <input
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
                    <label className="text-xs font-medium text-dune">{t('slaMinutes')}</label>
                    <input
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
