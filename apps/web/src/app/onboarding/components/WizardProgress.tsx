export const STEPS = ['Create Org', 'Describe Business', 'Meet Agent', 'Teach Agent', 'Connect Channel', 'Test It'];

export function WizardProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isDone = step < currentStep;

        return (
          <div key={step} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                  isDone
                    ? 'bg-green-600 text-white'
                    : isActive
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isDone ? '\u2713' : step}
              </div>
              <span className={`mt-1 text-xs ${isActive ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mb-4 h-0.5 w-6 ${isDone ? 'bg-green-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
