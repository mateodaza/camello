'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { WizardProgress } from './components/WizardProgress';
import { Step1CompanyName } from './components/Step1CompanyName';
import { Step2BusinessModel } from './components/Step2BusinessModel';
import { Step3MeetAgent } from './components/Step3MeetAgent';
import { Step4ConnectChannel } from './components/Step4ConnectChannel';
import { Step5TestIt } from './components/Step5TestIt';

interface Suggestion {
  template: string;
  agentName: string;
  agentType: string;
  personality: { tone: string; greeting: string; goals: string[] };
  constraints: { neverDiscuss: string[]; alwaysEscalate: string[] };
  industry: string;
  confidence: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { isLoaded } = useOrganization();
  const [step, setStep] = useState(1);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [previewCustomerId, setPreviewCustomerId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  // Check if already onboarded (org exists + tenant provisioned)
  const status = trpc.onboarding.getStatus.useQuery(undefined, {
    enabled: !!tenantId,
    retry: false,
  });
  const saveStep = trpc.onboarding.saveStep.useMutation();

  // Resume from saved step
  useEffect(() => {
    if (status.data) {
      const settings = status.data.settings as Record<string, unknown> | null;
      if (settings?.onboardingComplete) {
        router.replace('/dashboard');
        return;
      }
      if (settings?.onboardingStep && typeof settings.onboardingStep === 'number') {
        setStep(settings.onboardingStep);
      }
      if (status.data.previewCustomerId) {
        setPreviewCustomerId(status.data.previewCustomerId);
      }
    }
  }, [status.data, router]);

  const advanceToStep = (nextStep: number) => {
    setStep(nextStep);
    if (tenantId) {
      saveStep.mutate({ step: nextStep });
    }
  };

  // If org exists but no tenant provisioned yet, start at step 1
  if (!isLoaded) {
    return <p className="text-center text-gray-500">Loading...</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-bold">Set up your AI workforce</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        {step <= 3 ? "Let's get your first agent ready" : 'Almost there!'}
      </p>

      <WizardProgress currentStep={step} />

      {step === 1 && (
        <Step1CompanyName
          onComplete={(tid, custId) => {
            setTenantId(tid);
            setPreviewCustomerId(custId);
            advanceToStep(2);
          }}
        />
      )}

      {step === 2 && (
        <Step2BusinessModel
          onComplete={(s) => {
            setSuggestion(s);
            advanceToStep(3);
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
          <p className="text-sm text-gray-500">Missing agent configuration.</p>
          <button onClick={() => setStep(2)} className="mt-2 text-sm text-gray-900 underline">
            Go back to business description
          </button>
        </div>
      )}

      {step === 4 && (
        <Step4ConnectChannel onComplete={() => advanceToStep(5)} />
      )}

      {step === 5 && (
        <Step5TestIt previewCustomerId={previewCustomerId} />
      )}
    </div>
  );
}
