import { useTranslations } from 'next-intl';

export const STEP_KEYS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const;

export function WizardProgress({ currentStep }: { currentStep: number }) {
  const t = useTranslations('onboarding');
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEP_KEYS.map((key, i) => {
        const label = t(key);
        const step = i + 1;
        const isActive = step === currentStep;
        const isDone = step < currentStep;

        return (
          <div key={step} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                  isDone
                    ? 'bg-teal text-cream'
                    : isActive
                      ? 'bg-midnight text-cream'
                      : 'bg-charcoal/10 text-dune'
                }`}
              >
                {isDone ? '\u2713' : step}
              </div>
              <span className={`mt-1 text-xs ${isActive ? 'font-medium text-charcoal' : 'text-dune'}`}>
                {label}
              </span>
            </div>
            {i < STEP_KEYS.length - 1 && (
              <div className={`mb-4 h-0.5 w-6 ${isDone ? 'bg-teal' : 'bg-charcoal/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
