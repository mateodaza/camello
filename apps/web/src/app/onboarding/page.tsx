'use client';

import { useState, useEffect, useRef } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { WizardProgress } from './components/WizardProgress';
import { Step1CompanyName } from './components/Step1CompanyName';
import { Step2BusinessModel } from './components/Step2BusinessModel';
import { Step3MeetAgent } from './components/Step3MeetAgent';
import { Step4TeachAgent } from './components/Step4TeachAgent';
import { Step4ConnectChannel } from './components/Step4ConnectChannel';
import { Step5TestIt } from './components/Step5TestIt';

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

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const { organization, isLoaded } = useOrganization();
  const [step, setStep] = useState(1);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [wizardOrgId, setWizardOrgId] = useState<string | null>(null);
  const [previewCustomerId, setPreviewCustomerId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [businessDescription, setBusinessDescription] = useState<string>('');
  const [businessDescriptionSeeded, setBusinessDescriptionSeeded] = useState(false);
  const hasResumed = useRef(false);

  // Check if already onboarded (org exists + tenant provisioned)
  const status = trpc.onboarding.getStatus.useQuery(undefined, {
    enabled: !!tenantId,
    retry: false,
  });
  const saveStep = trpc.onboarding.saveStep.useMutation();

  // Org consistency guard: if the active Clerk org changes mid-wizard,
  // reset to Step 1 so tRPC context matches the wizard state.
  const orgMismatch = wizardOrgId && organization?.id && organization.id !== wizardOrgId;
  useEffect(() => {
    if (orgMismatch) {
      setStep(1);
      setTenantId(null);
      setWizardOrgId(null);
      setPreviewCustomerId(null);
      setSuggestion(null);
      setBusinessDescription('');
      setBusinessDescriptionSeeded(false);
      hasResumed.current = false;
    }
  }, [orgMismatch]);

  // Resume from saved step — runs only once when status first loads
  useEffect(() => {
    if (!status.data || hasResumed.current) return;
    hasResumed.current = true;

    const settings = status.data.settings as Record<string, unknown> | null;
    if (settings?.onboardingComplete) {
      router.replace('/dashboard');
      return;
    }
    if (settings?.onboardingStep && typeof settings.onboardingStep === 'number') {
      setStep(settings.onboardingStep);
    }
    // Restore persisted suggestion for Step 3 resume
    if (settings?.suggestion) {
      setSuggestion(settings.suggestion as Suggestion);
    }
    // Restore persisted business description for Step 4 resume
    if (settings?.businessDescription && typeof settings.businessDescription === 'string') {
      setBusinessDescription(settings.businessDescription);
    }
    // Restore seeded flag so Step 4 doesn't re-ingest on remount
    if (settings?.businessDescriptionSeeded) {
      setBusinessDescriptionSeeded(true);
    }
    if (status.data.previewCustomerId) {
      setPreviewCustomerId(status.data.previewCustomerId);
    }
  }, [status.data, router]);

  const advanceToStep = (nextStep: number, data?: { suggestion?: Suggestion; businessDescription?: string; businessDescriptionSeeded?: boolean }) => {
    setStep(nextStep);
    if (tenantId) {
      saveStep.mutate({
        step: nextStep,
        suggestion: data?.suggestion ?? undefined,
        businessDescription: data?.businessDescription ?? undefined,
        businessDescriptionSeeded: data?.businessDescriptionSeeded,
      });
    }
  };

  // If org exists but no tenant provisioned yet, start at step 1
  if (!isLoaded) {
    return <p className="text-center text-gray-500">{tc('loading')}</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        {step <= 4 ? t('subtitle1') : t('subtitle2')}
      </p>

      <WizardProgress currentStep={step} />

      {step > 2 && (
        <button
          onClick={() => setStep(step - 1)}
          className="mb-4 text-sm text-gray-500 hover:text-gray-800"
        >
          {t('back')}
        </button>
      )}

      {step === 1 && (
        <Step1CompanyName
          onComplete={(tid, custId) => {
            setTenantId(tid);
            setWizardOrgId(organization?.id ?? null);
            setPreviewCustomerId(custId);
            advanceToStep(2);
          }}
        />
      )}

      {step === 2 && (
        <Step2BusinessModel
          initialDescription={businessDescription}
          onComplete={(s, desc) => {
            setSuggestion(s);
            const descChanged = desc !== businessDescription;
            // If description changed, reset seeded flag so Step 4 re-indexes
            if (descChanged) {
              setBusinessDescriptionSeeded(false);
            }
            setBusinessDescription(desc);
            advanceToStep(3, {
              suggestion: s,
              businessDescription: desc,
              businessDescriptionSeeded: descChanged ? false : undefined,
            });
          }}
        />
      )}

      {step === 3 && suggestion && (
        <Step3MeetAgent
          suggestion={suggestion}
          onComplete={() => advanceToStep(4)}
        />
      )}

      {step === 3 && !suggestion && (
        <div className="text-center">
          <p className="text-sm text-gray-500">{t('missingConfig')}</p>
          <button onClick={() => setStep(2)} className="mt-2 text-sm text-gray-900 underline">
            {t('goBackDescription')}
          </button>
        </div>
      )}

      {step === 4 && (
        <Step4TeachAgent
          agentName={suggestion?.agentName ?? 'your agent'}
          businessDescription={businessDescription}
          alreadySeeded={businessDescriptionSeeded}
          onSeeded={() => {
            setBusinessDescriptionSeeded(true);
            if (tenantId) {
              saveStep.mutate({ businessDescriptionSeeded: true });
            }
          }}
          onComplete={() => advanceToStep(5)}
        />
      )}

      {step === 5 && (
        <Step4ConnectChannel onComplete={() => advanceToStep(6)} />
      )}

      {step === 6 && (
        <Step5TestIt previewCustomerId={previewCustomerId} />
      )}
    </div>
  );
}
