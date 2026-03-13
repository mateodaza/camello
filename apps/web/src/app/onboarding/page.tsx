'use client';

import { ChatOnboarding } from './components/ChatOnboarding';

// Re-exported for backward-compat with Step1–Step5 files (kept as reference, not rendered)
export type { Suggestion } from './components/ChatOnboarding';

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
    enabled: isLoaded && !!organization,
    retry: false,
  });
  const utils = trpc.useUtils();
  const saveStep = trpc.onboarding.saveStep.useMutation();
  const skipSetup = trpc.onboarding.complete.useMutation({
    onSuccess: async () => {
      await utils.tenant.me.invalidate();
      router.push('/dashboard');
    },
  });

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
    return <p className="text-center text-dune">{tc('loading')}</p>;
  }

  return (
    <div>
      <h1 className="mb-2 text-center font-heading text-2xl font-bold text-charcoal">{t('title')}</h1>
      <p className="mb-6 text-center text-sm text-dune">
        {step <= 3 ? t('subtitle1') : t('subtitle2')}
      </p>

      <WizardProgress currentStep={step} />

      {step >= 2 && (
        <div className="mb-4 flex items-center justify-between">
          {step > 2 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="text-sm text-dune hover:text-charcoal"
            >
              {t('back')}
            </button>
          ) : <span />}
          <button
            onClick={() => skipSetup.mutate()}
            disabled={skipSetup.isPending}
            className="text-xs text-dune hover:text-charcoal"
          >
            {skipSetup.isPending ? tc('loading') : t('skipSetup')}
          </button>
        </div>
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
          <p className="text-sm text-dune">{t('missingConfig')}</p>
          <button onClick={() => setStep(2)} className="mt-2 text-sm text-charcoal underline">
            {t('goBackDescription')}
          </button>
        </div>
      )}

      {step === 4 && (
        <Step4TeachAgent
          agentName={suggestion?.agentName ?? 'your agent'}
          businessDescription={businessDescription}
          alreadySeeded={businessDescriptionSeeded}
          archetype={suggestion?.agentType}
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
