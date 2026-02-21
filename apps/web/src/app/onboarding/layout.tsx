export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-sand">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {children}
      </div>
    </div>
  );
}
