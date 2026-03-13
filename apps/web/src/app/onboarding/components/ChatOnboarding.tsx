'use client';

import { useState, useEffect, useRef } from 'react';
import { useOrganization, CreateOrganization } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';
import { ChatBubble } from './ChatBubble';

type Stage =
  | 'creating_org'
  | 'provisioning'
  | 'ask_description'
  | 'generating_agent'
  | 'confirm_agent'
  | 'collecting_knowledge'
  | 'ask_channel'
  | 'done';

export interface Suggestion {
  template: 'services' | 'ecommerce' | 'saas' | 'restaurant' | 'realestate';
  agentName: string;
  agentType: 'sales' | 'support' | 'marketing' | 'custom';
  personality: {
    tone: 'professional' | 'friendly' | 'casual' | 'formal';
    greeting: string;
    goals: string[];
  };
  constraints: { neverDiscuss: string[]; alwaysEscalate: string[] };
  industry: string;
  confidence: number;
}

function stepToStage(step: number): Stage {
  if (step <= 2) return 'ask_description';
  if (step === 3) return 'confirm_agent';
  if (step === 4) return 'collecting_knowledge';
  if (step >= 6) return 'done';
  return 'ask_channel';
}

function stageToStep(s: Stage): number {
  if (s === 'ask_description') return 1;
  if (s === 'confirm_agent') return 3;
  if (s === 'collecting_knowledge') return 4;
  if (s === 'ask_channel') return 5;
  return 6;
}

interface Props {
  /** Only used in tests to pre-seed initial stage without full flow. */
  _testStage?: Stage;
}

export function ChatOnboarding({ _testStage }: Props) {
  const t = useTranslations('onboardingChat');
  const tc = useTranslations('channels');
  const locale = useLocale();
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();

  const [stage, setStage] = useState<Stage>(_testStage ?? 'creating_org');
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [agentName, setAgentName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [description, setDescription] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [channelChoice, setChannelChoice] = useState<'webchat' | 'whatsapp' | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState<{ phoneNumberId?: string; token?: string }>({});
  const [copied, setCopied] = useState(false);
  const [previewCustomerId, setPreviewCustomerId] = useState<string | null>(null);

  const hasResumed = useRef(false);
  const provisionFired = useRef(!!_testStage);

  const widgetSnippet = `<script src="${process.env.NEXT_PUBLIC_WIDGET_URL ?? 'http://localhost:5173'}/widget.js" async></script>`;

  const saveStep = trpc.onboarding.saveStep.useMutation();

  const provision = trpc.onboarding.provision.useMutation({
    onSuccess: (data) => {
      setPreviewCustomerId(data.previewCustomerId);
      saveStep.mutate({ step: 1 });
      setStage('ask_description');
    },
    onError: () => {
      provisionFired.current = false;
      setStage('creating_org');
    },
  });

  const parse = trpc.onboarding.parseBusinessModel.useMutation({
    onSuccess: (data) => {
      const s = data as Suggestion;
      setSuggestion(s);
      setAgentName(s.agentName);
      setNameInput(s.agentName);
      saveStep.mutate({ step: 2, suggestion: s, businessDescription: description });
      setStage('confirm_agent');
    },
    onError: () => setStage('ask_description'),
  });

  const setupArtifact = trpc.onboarding.setupArtifact.useMutation({
    onSuccess: () => {
      saveStep.mutate({ step: 3 });
      setStage('collecting_knowledge');
    },
    onError: () => setStage('confirm_agent'),
  });

  const ingest = trpc.knowledge.ingest.useMutation();
  const queueUrl = trpc.knowledge.queueUrl.useMutation();

  const channelUpsert = trpc.channel.upsert.useMutation({
    onSuccess: () => {
      saveStep.mutate({ step: 6 });
      setStage('done');
    },
  });

  const complete = trpc.onboarding.complete.useMutation({
    onSuccess: () => router.push('/dashboard'),
  });

  const webhookCfg = trpc.channel.webhookConfig.useQuery(undefined, {
    enabled: isLoaded && !!organization,
  });

  const status = trpc.onboarding.getStatus.useQuery(undefined, {
    enabled: isLoaded && !!organization,
    retry: false,
  });

  // Resume from saved step
  useEffect(() => {
    if (_testStage) return;
    if (!status.data || hasResumed.current) return;
    hasResumed.current = true;
    const settings = status.data.settings as Record<string, unknown> | null;
    if (settings?.onboardingComplete) {
      router.replace('/dashboard');
      return;
    }
    const step = typeof settings?.onboardingStep === 'number' ? settings.onboardingStep : null;
    if (step !== null && step > 0) {
      setStage(stepToStage(step));
      provisionFired.current = true;
    }
    if (settings?.suggestion) {
      const s = settings.suggestion as Suggestion;
      setSuggestion(s);
      setAgentName(s.agentName);
      setNameInput(s.agentName);
    }
    if (typeof settings?.businessDescription === 'string') {
      setDescription(settings.businessDescription);
    }
    if (status.data.previewCustomerId) {
      setPreviewCustomerId(status.data.previewCustomerId);
    }
  }, [status.data, router, _testStage]);

  // Auto-provision when org becomes available
  useEffect(() => {
    if (_testStage) return;
    if (!isLoaded || !organization) return;
    if (stage !== 'creating_org') return;
    if (provisionFired.current) return;
    provisionFired.current = true;
    setStage('provisioning');
    provision.mutate({ orgId: organization.id, companyName: organization.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, organization?.id, stage]);

  const handleDescriptionSubmit = () => {
    if (description.trim().length < 10) return;
    setStage('generating_agent');
    parse.mutate({ description: description.trim(), locale: locale as 'en' | 'es' });
  };

  const handleConfirmAgent = () => {
    if (!suggestion) return;
    const finalName = editingName && nameInput.trim() ? nameInput.trim() : agentName;
    setAgentName(finalName);
    setupArtifact.mutate({
      name: finalName,
      type: suggestion.agentType as 'sales' | 'support' | 'marketing' | 'custom',
      personality: suggestion.personality as Record<string, unknown>,
      constraints: suggestion.constraints,
      profile: {},
    });
  };

  const handleKnowledgeContinue = async () => {
    if (knowledgeText.trim().length >= 10) {
      try {
        await ingest.mutateAsync({
          content: knowledgeText.trim(),
          title: 'Quick Facts',
          sourceType: 'upload',
        });
      } catch { /* continue anyway */ }
    }
    if (websiteUrl.trim()) {
      try {
        await queueUrl.mutateAsync({ url: websiteUrl.trim() });
      } catch { /* continue anyway */ }
    }
    saveStep.mutate({ step: 4 });
    setStage('ask_channel');
  };

  const handleWhatsApp = () => {
    const errs: { phoneNumberId?: string; token?: string } = {};
    if (!phoneNumberId.trim()) errs.phoneNumberId = t('whatsAppPhoneNumberIdRequired');
    if (!token.trim()) errs.token = t('whatsAppAccessTokenRequired');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    channelUpsert.mutate({
      channelType: 'whatsapp',
      phoneNumber: phoneNumberId,
      credentials: { access_token: token },
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  async function handleCopyValue(value: string) {
    await navigator.clipboard.writeText(value);
  }

  const handleWebchatDone = () => {
    saveStep.mutate({ step: 6 });
    setStage('done');
  };

  const handleFinishLater = () => {
    saveStep.mutate({ step: stageToStep(stage) });
    router.push('/dashboard');
  };

  if (!isLoaded && !_testStage) {
    return <p className="text-center text-sm text-dune">{t('loading')}</p>;
  }

  return (
    <div className="flex flex-col gap-4 pb-8">

      {/* creating_org: show Clerk org creation */}
      {stage === 'creating_org' && (
        <>
          <ChatBubble>{t('hello')}</ChatBubble>
          {!organization && (
            <CreateOrganization
              afterCreateOrganizationUrl="/onboarding"
              routing="hash"
            />
          )}
          {provision.isError && (
            <p className="text-sm text-sunset">{provision.error.message}</p>
          )}
        </>
      )}

      {/* provisioning: spinner while provision runs */}
      {stage === 'provisioning' && (
        <ChatBubble>
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4 animate-spin text-teal" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('settingUp')}
          </span>
        </ChatBubble>
      )}

      {/* ask_description: business description textarea */}
      {stage === 'ask_description' && (
        <>
          <ChatBubble>{t('askDescription', { companyName: organization?.name ?? '' })}</ChatBubble>
          <div className="sticky bottom-0 bg-sand py-2 space-y-2">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={4}
              minLength={10}
              maxLength={2000}
              className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <Button
              onClick={handleDescriptionSubmit}
              disabled={description.trim().length < 10}
            >
              {t('submit')}
            </Button>
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </>
      )}

      {/* generating_agent: typing indicator during LLM call */}
      {stage === 'generating_agent' && (
        <ChatBubble>
          <span className="flex items-center gap-1">
            {t('analyzing')}
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal [animation-delay:300ms]" />
            </span>
          </span>
        </ChatBubble>
      )}

      {/* confirm_agent: agent preview with confirm/rename buttons */}
      {stage === 'confirm_agent' && suggestion && (
        <>
          <ChatBubble>
            {t('confirmAgent', { agentName, greeting: suggestion.personality.greeting })}
          </ChatBubble>
          <div className="sticky bottom-0 bg-sand py-2 space-y-2">
            {editingName && (
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t('newName')}
                className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
              />
            )}
            <div className="flex gap-2">
              <Button onClick={handleConfirmAgent} disabled={setupArtifact.isPending}>
                {setupArtifact.isPending ? t('creating') : t('yesGood')}
              </Button>
              {!editingName && (
                <Button variant="ghost" onClick={() => setEditingName(true)}>
                  {t('changeName')}
                </Button>
              )}
            </div>
            {setupArtifact.isError && (
              <p className="text-sm text-sunset">{setupArtifact.error.message}</p>
            )}
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </>
      )}

      {/* collecting_knowledge: quick facts + website URL */}
      {stage === 'collecting_knowledge' && (
        <>
          <ChatBubble>{t('collectKnowledge', { agentName })}</ChatBubble>
          <div className="space-y-2">
            <textarea
              value={knowledgeText}
              onChange={(e) => setKnowledgeText(e.target.value)}
              placeholder={t('knowledgePlaceholder')}
              rows={4}
              maxLength={5000}
              className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
          </div>
          <ChatBubble>{t('askWebsite', { agentName })}</ChatBubble>
          <div className="sticky bottom-0 bg-sand py-2 space-y-2">
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder={t('websitePlaceholder')}
              className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleKnowledgeContinue}
                disabled={ingest.isPending || queueUrl.isPending}
              >
                {ingest.isPending || queueUrl.isPending ? t('saving') : t('submit')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { saveStep.mutate({ step: 4 }); setStage('ask_channel'); }}
              >
                {t('skipForNow')}
              </Button>
            </div>
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </>
      )}

      {/* ask_channel: channel choice */}
      {stage === 'ask_channel' && !channelChoice && (
        <>
          <ChatBubble>{t('askChannel', { agentName })}</ChatBubble>
          <div className="sticky bottom-0 bg-sand py-2 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setChannelChoice('webchat')}
                className="rounded-lg border border-charcoal/10 p-4 text-left transition hover:border-charcoal/25 hover:shadow-sm"
              >
                <p className="font-medium">{t('webchatChoice')}</p>
              </button>
              <button
                onClick={() => setChannelChoice('whatsapp')}
                className="rounded-lg border border-charcoal/10 p-4 text-left transition hover:border-charcoal/25 hover:shadow-sm"
              >
                <p className="font-medium">{t('whatsappChoice')}</p>
              </button>
            </div>
            <Button
              variant="ghost"
              onClick={() => { saveStep.mutate({ step: 6 }); setStage('done'); }}
            >
              {t('skipForNow')}
            </Button>
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </>
      )}

      {/* ask_channel + webchat: embed snippet */}
      {stage === 'ask_channel' && channelChoice === 'webchat' && (
        <>
          <ChatBubble>{t('webchatSnippetDesc')}</ChatBubble>
          <div className="rounded bg-midnight p-3">
            <code className="text-xs text-green-400">{widgetSnippet}</code>
          </div>
          <div className="sticky bottom-0 bg-sand py-2 space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? t('copied') : t('copySnippet')}
              </Button>
              <Button onClick={handleWebchatDone}>{t('continue')}</Button>
            </div>
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </>
      )}

      {/* ask_channel + whatsapp: credential form + webhook config */}
      {stage === 'ask_channel' && channelChoice === 'whatsapp' && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="wa-phone-number-id" className="text-sm font-medium">
              {tc('channelWhatsappPhoneNumberId')}
            </label>
            <input
              type="text"
              id="wa-phone-number-id"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder={t('whatsAppPhonePlaceholder')}
              className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p className="text-xs text-dune">{tc('channelWhatsappPhoneNumberIdHint')}</p>
            {errors.phoneNumberId && (
              <p className="text-sm text-error">{errors.phoneNumberId}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="wa-access-token" className="text-sm font-medium">
              {tc('channelWhatsappAccessToken')}
            </label>
            <input
              type="password"
              id="wa-access-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
            />
            <p className="text-xs text-dune">{tc('channelWhatsappAccessTokenHint')}</p>
            {errors.token && (
              <p className="text-sm text-error">{errors.token}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {tc('channelWebhookUrl')}
            </label>
            {webhookCfg.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookCfg.data?.webhookUrl ?? ''}
                  className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm bg-charcoal/5"
                />
                <Button
                  variant="outline"
                  onClick={() => handleCopyValue(webhookCfg.data?.webhookUrl ?? '')}
                >
                  {t('copy')}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              {tc('channelWebhookVerifyToken')}
            </label>
            {webhookCfg.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  className="w-full rounded-md border border-charcoal/15 px-3 py-2 text-sm bg-charcoal/5 font-mono"
                  value={webhookCfg.data?.verifyToken ?? ''}
                />
                <Button
                  variant="outline"
                  onClick={() => handleCopyValue(webhookCfg.data?.verifyToken ?? '')}
                >
                  {t('copy')}
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-dune">{tc('channelWebhookInstructions')}</p>

          <div className="sticky bottom-0 bg-sand py-2 space-y-2">
            <div className="flex gap-2">
              <Button disabled={channelUpsert.isPending} onClick={handleWhatsApp}>
                {channelUpsert.isPending ? t('saving') : t('saveAndContinue')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { saveStep.mutate({ step: 6 }); setStage('done'); }}
              >
                {t('whatsAppSkip')}
              </Button>
            </div>
            {channelUpsert.isError && (
              <p className="text-sm text-error">{channelUpsert.error.message}</p>
            )}
            <button
              type="button"
              onClick={handleFinishLater}
              className="block w-full text-center text-xs text-dune hover:text-charcoal"
            >
              {t('finishLater')}
            </button>
          </div>
        </div>
      )}

      {/* done: completion message + dashboard CTA */}
      {stage === 'done' && (
        <>
          <ChatBubble>{t('done', { agentName })}</ChatBubble>
          <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
            {complete.isPending ? t('finishing') : t('openDashboard')}
          </Button>
        </>
      )}
    </div>
  );
}
